import { createRequestListener } from "@mjackson/node-fetch-server";
import compression from "compression";
import express from "express";

import * as serverMod from "./dist/server/server.js";

const listener = createRequestListener(async (request) => {
	return serverMod.handleRequest(request);
});

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

app.use((req, res, next) => {
	if (req.method === "POST" && req.headers["psc-action"]) {
		try {
			return listener(req, res);
		} catch (e) {
			return next(e);
		}
	}
	next();
});

app.listen(3000, () => {
	console.log("Server started on http://localhost:3000");
});
