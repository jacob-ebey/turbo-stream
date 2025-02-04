import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as fsp from "node:fs/promises";
import * as path from "node:path";
import { pathToFileURL } from "node:url";

import { createRequestListener } from "@mjackson/node-fetch-server";
import preact from "@preact/preset-vite";
import * as lexer from "es-module-lexer";
import {
	createRunnableDevEnvironment,
	defineConfig,
	type RunnableDevEnvironment,
} from "vite";
import type * as vite from "vite";

const toPrerender = ["/", "/about"];
const preactServerEnvironments = ["server"];

function dynamicImport(s: string) {
	return import(pathToFileURL(path.resolve(s)).href);
}

export default defineConfig(({ mode }) => {
	let building = false;
	let scanning = false;

	let foundModules = {
		client: new Map<string, string>(),
		server: new Map<string, string>(),
	};

	let manifest: any;

	return {
		build: {
			minify: false,
		},
		resolve: {
			dedupe: ["preact"],
		},
		builder: {
			async buildApp(builder) {
				if (mode === "prerender") {
					const [indexHTML, ssrMod, serverMod] = await Promise.all([
						fsp.readFile("dist/browser/index.html", "utf8"),
						dynamicImport("./dist/ssr/ssr.js") as Promise<
							typeof import("./src/ssr")
						>,
						dynamicImport("./dist/server/server.js") as Promise<
							typeof import("./src/server")
						>,
					]);

					for (const location of toPrerender) {
						const url = new URL(location, "http://localhost");
						const request = new Request(url.toString());
						const serverResponse = await serverMod.handleRequest(request);
						if (!serverResponse.body) throw new Error("No body");
						const [serverBodyA, serverBodyB] = serverResponse.body.tee();
						let dataFilepath = `dist/browser/${location.slice(1)}.data`;
						const rendered = await ssrMod.prerender(
							indexHTML,
							serverBodyA.pipeThrough(new TextDecoderStream()),
						);

						let htmlFilepath = `dist/browser/${location.slice(1)}/index.html`;
						await Promise.all([
							fsp
								.mkdir(path.dirname(htmlFilepath), { recursive: true })
								.then(() => fsp.writeFile(htmlFilepath, rendered)),
							fsp
								.mkdir(path.dirname(htmlFilepath), { recursive: true })
								.then(async () =>
									fsp.writeFile(
										dataFilepath,
										await new Response(serverBodyB).text(),
									),
								),
						]);
					}
				} else {
					console.log("Scanning app...");

					scanning = true;
					await Promise.all([
						builder.build(builder.environments.client),
						builder.build(builder.environments.ssr),
						builder.build(builder.environments.server),
					]);

					scanning = false;

					console.log("Building app...");
					building = true;

					builder.environments.client.config.build.rollupOptions.input =
						Array.from(
							new Set([
								...rollupInputsToArray(
									builder.environments.client.config.build.rollupOptions.input,
								),
								...Array.from(foundModules.client.keys()),
							]),
						);

					const browserOutput = (await builder.build(
						builder.environments.client,
					)) as vite.Rollup.RollupOutput;

					const manifestAsset = browserOutput?.output.find(
						(asset) => asset.fileName === ".vite/manifest.json",
					);
					const manifestSource =
						manifestAsset?.type === "asset" && (manifestAsset.source as string);
					manifest = JSON.parse(manifestSource || "{}");

					const [ssrOutput, serverOutput] = await Promise.all([
						builder.build(builder.environments.ssr),
						builder.build(builder.environments.server),
					]);

					const clientOutDir = builder.environments.client.config.build.outDir;
					moveStaticAssets(
						ssrOutput as vite.Rollup.RollupOutput,
						builder.environments.ssr.config.build.outDir,
						clientOutDir,
					);
					moveStaticAssets(
						serverOutput as vite.Rollup.RollupOutput,
						builder.environments.server.config.build.outDir,
						clientOutDir,
					);
				}
			},
			sharedConfigBuild: true,
			sharedPlugins: true,
		},
		environments: {
			client: {
				build: {
					manifest: true,
					outDir: "dist/browser",
					rollupOptions: {
						input: ["index.html"],
						preserveEntrySignatures: "exports-only",
					},
				},
			},
			ssr: {
				consumer: "server",
				build: {
					emitAssets: true,
					outDir: "dist/ssr",
					ssrManifest: true,
					rollupOptions: {
						input: "src/ssr.tsx",
					},
				},
				resolve: {
					noExternal: true,
				},
			},
			server: {
				consumer: "server",
				build: {
					emitAssets: true,
					outDir: "dist/server",
					ssrManifest: true,
					rollupOptions: {
						input: "src/server.tsx",
					},
				},
				dev: {
					createEnvironment(name, config, context) {
						return createRunnableDevEnvironment(name, config);
					},
				},
				resolve: {
					noExternal: true,
				},
			},
		},
		plugins: [
			preact({}),
			{
				name: "preact-server",
				resolveId(id) {
					if (id === "virtual:preact-server/client") {
						return "\0virtual:preact-server/client";
					}
				},
				load(id) {
					if (id === "\0virtual:preact-server/client") {
						if (preactServerEnvironments.includes(this.environment.name)) {
							throw new Error("Cannot load client references on the server");
						}
						if (this.environment.mode !== "dev") {
							if (this.environment.name !== "client") {
								return `
									const clientModules = {
										${Array.from(foundModules.client.keys())
											.map((filename) => {
												return `${JSON.stringify(
													findClientModule(
														path.relative(
															path.resolve(this.environment.config.root),
															filename,
														),
														manifest,
														this.environment.config.base,
													).id,
												)}: () => import(${JSON.stringify(filename)}),`;
											})
											.join("  \n")}
									};

									export async function loadClientReference([id, name, ...chunks]) {
										const mod = await clientModules[id]();
										return mod[name];
									}
								`;
							}

							return `
								export async function loadClientReference([id, name, ...chunks]) {
									const importPromise = import(/* @vite-ignore */ id);
									for (const chunk of chunks) {
										import(chunk);
									}
									const mod = await importPromise;
									return mod[name];
								}
							`;
						}
						return `
							export async function loadClientReference([id, name]) {
								const mod = await import(/* @vite-ignore */ id);
								return mod[name];
							}
						`;
					}
				},
				transform(code, id) {
					if (!isJavaScriptModule(id)) return;

					const directiveMatch = code.match(/['"]use (client|server)['"]/);

					const hash = crypto
						.createHash("sha256")
						.update(id)
						.digest("hex")
						.slice(0, 8);
					if (scanning) {
						if (directiveMatch) {
							const useFor = directiveMatch[1] as "client" | "server";
							foundModules[useFor].set(id, hash);
						}

						const [imports, exports] = lexer.parse(code, id);
						// Return a new module retaining the import statements
						// and replacing exports with null exports
						const newImports = imports
							.map((imp) => `import ${JSON.stringify(imp.n)};`)
							.join("\n");
						const newExports = exports
							.map((exp) =>
								exp.n === "default"
									? "export default null;"
									: `export let ${exp.n} = null;`,
							)
							.join("\n");
						return `${newImports}\n${newExports}`;
					}

					if (!directiveMatch) return;
					const useFor = directiveMatch[1] as "client" | "server";

					const [, exports] = lexer.parse(code, id);
					const mod =
						building && this.environment.name !== "client"
							? findClientModule(
									path.relative(path.resolve(this.environment.config.root), id),
									manifest,
									this.environment.config.base,
								)
							: null;
					let referenceId: string = mod
						? mod.id
						: "/" +
							path
								.relative(this.environment.config.root, id)
								.replace(/\\/g, "/");
					let chunks: string[] = mod ? mod.chunks : [];

					if (useFor === "client" && this.environment.name !== "client") {
						if (preactServerEnvironments.includes(this.environment.name)) {
							const newExports = exports
								.map((exp) =>
									exp.n === "default"
										? `export default { $$typeof: CLIENT_REFERENCE, $$id: ${JSON.stringify(referenceId)}, $$name: ${JSON.stringify(exp.n)}, $$chunks: ${JSON.stringify(chunks)} };`
										: `export const ${exp.n} = { $$typeof: CLIENT_REFERENCE, $$id: ${JSON.stringify(referenceId)}, $$name: ${JSON.stringify(exp.n)}, $$chunks: ${JSON.stringify(chunks)} };`,
								)
								.join("\n");

							return `const CLIENT_REFERENCE = Symbol.for("preact.client.reference");\n${newExports}`;
						}
					} else if (useFor === "server") {
						if (preactServerEnvironments.includes(this.environment.name)) {
							const markExports = exports
								.map(
									(exp) =>
										`if (typeof ${exp.n} === "function") { ${exp.n}.$$typeof = SERVER_REFERENCE; ${exp.n}.$$id = ${JSON.stringify(referenceId)}; , $$name: ${JSON.stringify(exp.n)} }`,
								)
								.join("\n");

							return `${code}\n${markExports}`;
						}

						const newExports = exports
							.map((exp) =>
								exp.n === "default"
									? `export default { $$typeof: SERVER_REFERENCE, $$id: ${JSON.stringify(referenceId)}, $$name: ${JSON.stringify(exp.n)} };`
									: `export const ${exp.n} = { $$typeof: SERVER_REFERENCE, $$id: ${JSON.stringify(referenceId)}, $$name: ${JSON.stringify(exp.n)} };`,
							)
							.join("\n");

						return `const SERVER_REFERENCE = Symbol.for("preact.server.reference");\n${newExports}`;
					}
				},
			},
			{
				name: "dev-server",
				configureServer(server) {
					const serverEnv = server.environments
						.server as RunnableDevEnvironment;

					const listener = createRequestListener(async (request) => {
						const serverMod =
							await serverEnv.runner.import<typeof import("./src/server")>(
								"./src/server.tsx",
							);

						const url = new URL(request.url);
						url.pathname = url.pathname.replace(/\.data$/, "");

						return serverMod.handleRequest(
							new Request(url, {
								body: request.body,
								duplex:
									request.method !== "GET" && request.method !== "HEAD"
										? "half"
										: undefined,
								headers: request.headers,
								method: request.method,
								signal: request.signal,
							} as RequestInit & { duplex?: "half" }),
						);
					});

					return () => {
						server.middlewares.use(async (req, res, next) => {
							const url = new URL(req.url ?? "/", "http://localhost");
							if (url.pathname.endsWith(".data")) {
								try {
									listener(req, res);
								} catch (error) {
									next(error);
								}
							} else {
								next();
							}
						});
					};
				},
			},
		],
	};
});

const jsModuleExtensions = [".js", ".mjs", ".jsx", ".ts", ".mts", ".tsx"];
function isJavaScriptModule(id: string) {
	return jsModuleExtensions.some((ext) => id.endsWith(ext));
}

function rollupInputsToArray(
	rollupInputs: vite.Rollup.InputOption | undefined,
) {
	return Array.isArray(rollupInputs)
		? rollupInputs
		: typeof rollupInputs === "string"
			? [rollupInputs]
			: rollupInputs
				? Object.values(rollupInputs)
				: [];
}

function findClientModule(forFilename: string, manifest: any, base: string) {
	const collected = collectChunks(base, forFilename, manifest);
	return {
		id: collected[0],
		chunks: collected.slice(1),
	};
}

function collectChunks(
	base: string,
	forFilename: string,
	manifest: Record<string, { file: string; imports: string[] }>,
	collected: Set<string> = new Set(),
) {
	if (manifest[forFilename]) {
		collected.add(base + manifest[forFilename].file);
		for (const imp of manifest[forFilename].imports ?? []) {
			collectChunks(base, imp, manifest, collected);
		}
	}

	return Array.from(collected);
}

function moveStaticAssets(
	output: vite.Rollup.RollupOutput,
	outDir: string,
	clientOutDir: string,
) {
	const manifestAsset = output.output.find(
		(asset) => asset.fileName === ".vite/ssr-manifest.json",
	);
	if (!manifestAsset || manifestAsset.type !== "asset")
		throw new Error("could not find manifest");
	const manifest = JSON.parse(manifestAsset.source as string);

	const processed = new Set<string>();
	for (const assets of Object.values(manifest) as string[][]) {
		for (const asset of assets) {
			const fullPath = path.join(outDir, asset.slice(1));

			if (asset.endsWith(".js") || processed.has(fullPath)) continue;
			processed.add(fullPath);

			if (!fs.existsSync(fullPath)) continue;

			const relative = path.relative(outDir, fullPath);
			fs.renameSync(fullPath, path.join(clientOutDir, relative));
		}
	}
}
