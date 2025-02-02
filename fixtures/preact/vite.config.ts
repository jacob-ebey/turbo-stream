import * as fs from "node:fs/promises";
import * as path from "node:path";
import { Readable } from "node:stream";

import preact from "@preact/preset-vite";
import * as lexer from "es-module-lexer";
import {
	createRunnableDevEnvironment,
	defineConfig,
	type RunnableDevEnvironment,
} from "vite";

const toPrerender = ["/"];
const preactServerEnvironments = ["server"];

export default defineConfig(() => {
	let scanning = false;

	let foundModules = {
		client: new Set<string>(),
		server: new Set<string>(),
	};

	return {
		builder: {
			async buildApp(builder) {
				console.log({ PRERENDER: process.env.PRERENDER });
				if (process.env.PRERENDER === "1") {
					const [indexHTML, prerenderMod, serverMod] = await Promise.all([
						fs.readFile("dist/browser/index.html", "utf8"),
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
						const rendered = await prerenderMod.prerender(
							indexHTML,
							serverResponse.body.pipeThrough(new TextDecoderStream()),
						);

						let htmlFilepath = `dist/browser/${location.slice(1)}/index.html`;
						await fs.writeFile(htmlFilepath, rendered);
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
					await Promise.all([
						builder.build(builder.environments.client),
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
					outDir: "dist/browser",
					rollupOptions: {
						input: "index.html",
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
							throw new Error(
								"Client reference loading is not yet supported in production",
							);
						}
						return `
							export async function loadClientReference(id, name) {
								const mod = await import(/* @vite-ignore */ id);
								return mod[name];
							}
						`;
					}
				},
				transform(code, id) {
					if (!isJavaScriptModule(id)) return;

					const directiveMatch = code.match(/['"]use (client|server)['"]/);

					if (scanning) {
						if (directiveMatch) {
							const useFor = directiveMatch[1] as "client" | "server";
							foundModules[useFor].add(id);
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
					const referenceId =
						"/" +
						path.relative(this.environment.config.root, id).replace(/\\/g, "/");

					if (useFor === "client") {
						if (preactServerEnvironments.includes(this.environment.name)) {
							const newExports = exports
								.map((exp) =>
									exp.n === "default"
										? `export default { $$typeof: CLIENT_REFERENCE, $$id: ${JSON.stringify(referenceId)}, $$name: ${JSON.stringify(exp.n)} };`
										: `export const ${exp.n} = { $$typeof: CLIENT_REFERENCE, $$id: ${JSON.stringify(referenceId)}, $$name: ${JSON.stringify(exp.n)} };`,
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
									// TODO: Actually create a request object
									const serverResponse = await serverMod.handleRequest(
										new Request(new URL(req.url ?? "/", "http://localhost")),
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
