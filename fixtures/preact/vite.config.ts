import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as fsp from "node:fs/promises";
import * as path from "node:path";
import { Readable } from "node:stream";

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

export default defineConfig(() => {
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
		builder: {
			async buildApp(builder) {
				console.log({ PRERENDER: process.env.PRERENDER });
				if (process.env.PRERENDER === "1") {
					const [indexHTML, prerenderMod, serverMod] = await Promise.all([
						fsp.readFile("dist/browser/index.html", "utf8"),
						import(
							// @ts-expect-error - no types
							"./dist/prerender/prerender.js"
						) as Promise<typeof import("./src/prerender")>,
						import(
							// @ts-expect-error - no types
							"./dist/server/server.js"
						) as Promise<typeof import("./src/server")>,
					]);

					for (const location of toPrerender) {
						const url = new URL(location, "http://localhost");
						const request = new Request(url.toString());
						const serverResponse = await serverMod.handleRequest(request);
						if (!serverResponse.body) throw new Error("No body");
						const [serverBodyA, serverBodyB] = serverResponse.body.tee();
						let dataFilepath = `dist/browser/${location.slice(1)}.data`;
						const rendered = await prerenderMod.prerender(
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
						builder.build(builder.environments.prerender),
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

					await Promise.all([
						builder.build(builder.environments.prerender),
						builder.build(builder.environments.server),
					]);
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
					},
				},
			},
			prerender: {
				consumer: "server",
				build: {
					outDir: "dist/prerender",
					rollupOptions: {
						input: "src/prerender.tsx",
					},
				},
			},
			server: {
				consumer: "server",
				build: {
					outDir: "dist/server",
					rollupOptions: {
						input: "src/server.tsx",
					},
				},
				dev: {
					createEnvironment(name, config, context) {
						return createRunnableDevEnvironment(name, config);
					},
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
							// if (this.environment.name !== "client") {
							return `
									const clientModules = {
										${Array.from(foundModules.client)
											.map(([filename, hash]) => {
												return `${JSON.stringify(hash)}: () => import(${JSON.stringify(
													filename,
												)}),`;
											})
											.join("  \n")}
									};

									export async function loadClientReference([id, name, ...chunks]) {
										const mod = await clientModules[id]();
										return mod[name];
									}
								`;
							// }

							// return `
							// 	export async function loadClientReference([id, name, ...chunks]) {
							// 		const importPromise = import(/* @vite-ignore */ id);
							// 		for (const chunk of chunks) {
							// 			import(chunk);
							// 		}
							// 		const mod = await importPromise;
							// 		return mod[name];
							// 	}
							// `;
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
					let referenceId: string = building
						? hash
						: "/" +
							path
								.relative(this.environment.config.root, id)
								.replace(/\\/g, "/");
					let chunks: string[] = [];

					// if (building) {

					// }

					if (useFor === "client") {
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
					return () => {
						server.middlewares.use(async (req, res, next) => {
							if (req.headers.accept?.match(/\btext\/x-component\b/)) {
								try {
									const serverEnv = server.environments
										.server as RunnableDevEnvironment;
									const serverMod =
										await serverEnv.runner.import<
											typeof import("./src/server")
										>("./src/server.tsx");

									const url = new URL(req.url ?? "/", "http://localhost");
									url.pathname = url.pathname.replace(/\.data$/, "");
									// TODO: Actually create a request object
									const serverResponse = await serverMod.handleRequest(
										new Request(url),
									);
									// TODO: Actually send response
									if (!serverResponse.body) throw new Error("No body");
									res.setHeader("Content-Type", "text/x-component");
									Readable.fromWeb(serverResponse.body as any).pipe(res, {
										end: true,
									});
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
