import { h, type VNode } from "preact";
import { useState } from "preact/hooks";
import { Suspense } from "preact/compat";
import { hydrate } from "preact-iso";

import {
	decode,
	type DecodeClientReferenceFunction,
} from "../../../src/preact";
import { loadClientReference } from "virtual:preact-server/client";

import type { EncodedClientReference } from "./server";

declare global {
	interface Window {
		PREACT_STREAM?: ReadableStream<string>;
	}
}

function Loading() {
	return <div>Loading...</div>;
}

let setPayload: (payload: VNode) => void;
function Root({ initialPayload }: { initialPayload: VNode }) {
	const [payload, _setPayload] = useState(() => initialPayload);
	setPayload = _setPayload;
	return <Suspense fallback={<Loading />}>{payload}</Suspense>;
}

(window.PREACT_STREAM
	? Promise.resolve(
			new Response(window.PREACT_STREAM.pipeThrough(new TextEncoderStream())),
		)
	: fetch(window.location.href, {
			headers: {
				accept: "text/x-component",
			},
		})
).then(async (serverResponse) => {
	if (!serverResponse.body) throw new Error("No body");
	const payloadStream = serverResponse.body.pipeThrough(
		new TextDecoderStream(),
	);
	const payload = await decode<VNode>(payloadStream, {
		decodeClientReference,
	});
	const app = document.getElementById("app");
	if (!app) throw new Error("No #app element");
	hydrate(h(Root, { initialPayload: payload }), app);
});

const decodeClientReference: DecodeClientReferenceFunction<
	EncodedClientReference
> = async ([id, name]) => {
	return loadClientReference(id, name);
};
