import { h, type VNode } from "preact";
import { useState } from "preact/hooks";
import { Suspense } from "preact/compat";
import { hydrate } from "preact-iso";

import { decode } from "../../../src/preact";

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
	const payload = await decode<VNode>(payloadStream);
	const app = document.getElementById("app");
	if (!app) throw new Error("No #app element");
	hydrate(h(Root, { initialPayload: payload }), app);
});
