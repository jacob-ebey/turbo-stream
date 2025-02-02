import * as fs from "node:fs/promises";
import { Readable } from "node:stream";

import preact from "@preact/preset-vite";
import {
	createRunnableDevEnvironment,
	defineConfig,
	type RunnableDevEnvironment,
} from "vite";

const toPrerender = ["/"];

export default defineConfig({
	builder: {
		async buildApp(builder) {
			if (process.env.PRERENDER) {
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
				await Promise.all([
					builder.build(builder.environments.client),
					builder.build(builder.environments.prerender),
					builder.build(builder.environments.server),
				]);
			}
		},
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
			name: "dev-server",
			configureServer(server) {
				return () => {
					server.middlewares.use(async (req, res, next) => {
						if (req.headers.accept?.match(/\btext\/x-component\b/)) {
							try {
								const serverEnv = server.environments
									.server as RunnableDevEnvironment;
								const serverMod =
									await serverEnv.runner.import<typeof import("./src/server")>(
										"./src/server.tsx",
									);
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
});
