import * as fs from "node:fs";

import { createRequestListener } from "@mjackson/node-fetch-server";
import compression from "compression";
import express from "express";

import * as serverMod from "./dist/server/server.js";
import * as ssrMod from "./dist/ssr/ssr.js";

const HTML = fs.readFileSync("dist/browser/__template.html", "utf-8");

const app = express();

app.use(compression());

app.use(
	express.static("dist/browser/assets", {
		immutable: true,
		maxAge: "1y",
	}),
);
app.use(
	express.static("dist/browser", {
		dotfiles: "allow",
	}),
);

app.use(
	createRequestListener(async (request) => {
		const url = new URL(request.url);
		const serverResponsePromise = serverMod.handleRequest(request);

		if (
			url.pathname.endsWith(".data") ||
			(request.headers.get("psc-action") &&
				request.method === "POST" &&
				request.body)
		) {
			return serverResponsePromise;
		}

		const serverResponse = await serverResponsePromise;
		if (!serverResponse.body) throw new Error("No body.");
		const body = await ssrMod.prerender(
			HTML,
			serverResponse.body.pipeThrough(new TextDecoderStream()),
		);

		const headers = new Headers(serverResponse.headers);
		headers.set("content-type", "text/html");
		return new Response(body, {
			headers,
			status: serverResponse.status,
		});
	}),
);

app.listen(3000, () => {
	console.log("Server started on http://localhost:3000");
});
