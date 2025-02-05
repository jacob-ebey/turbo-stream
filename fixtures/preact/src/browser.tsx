import { h, type ComponentType, type VNode } from "preact";
import { useEffect, useState } from "preact/hooks";
import { lazy, Suspense } from "preact/compat";
import { createRoot, hydrateRoot } from "preact/compat/client";

import {
	decode,
	encode,
	type DecodeServerReferenceFunction,
	type DecodeClientReferenceFunction,
} from "turbo-stream/preact";
// @ts-expect-error - no types
import { loadClientReference } from "virtual:preact-server/client";

import type { ActionPayload, EncodedClientReference } from "./server";

declare global {
	interface Window {
		PREACT_STREAM?: ReadableStream<string>;
	}
}

let setPayload: (payload: VNode) => void;

function Router({ initialPayload }: { initialPayload: VNode }) {
	const [payload, _setPayload] = useState<{
		current: VNode;
		last: VNode | null;
	}>(() => ({
		current: initialPayload,
		last: null,
	}));
	setPayload = (current: VNode) => {
		_setPayload((last) => ({ current, last: last.current }));
	};

	useEffect(() => {
		if (window.navigation) {
			const onNavigate = (event: NavigateEvent) => {
				if (
					!event.canIntercept ||
					event.downloadRequest ||
					!event.userInitiated ||
					event.defaultPrevented ||
					new URL(event.destination.url).origin !== window.location.origin
				) {
					return;
				}

				event.intercept({
					async handler() {
						const url = new URL(event.destination.url);
						url.pathname += ".data";
						const response = await fetch(url, {
							headers: {
								accept: "text/x-component",
							},
						});
						if (!response.body) throw new Error("No body");
						const payloadStream = response.body.pipeThrough(
							new TextDecoderStream(),
						);
						const payload = await decode<VNode>(payloadStream, {
							decodeClientReference,
							decodeServerReference,
						});
						setPayload(payload);
					},
				});
			};
			window.navigation.addEventListener("navigate", onNavigate);
			return () => {
				window.navigation.removeEventListener("navigate", onNavigate);
			};
		}
	}, []);

	return <Suspense fallback={payload.last}>{payload.current}</Suspense>;
}

function getDataURL() {
	const url = new URL(window.location.href);
	url.pathname += ".data";
	return url;
}

(window.PREACT_STREAM
	? Promise.resolve(window.PREACT_STREAM)
	: fetch(getDataURL(), {
			headers: {
				accept: "text/x-component",
			},
		}).then((r) => r.body?.pipeThrough(new TextDecoderStream()))
).then(async (payloadStream) => {
	if (!payloadStream) throw new Error("No body");
	const payload = await decode<VNode>(payloadStream, {
		decodeClientReference,
		decodeServerReference,
	});
	const app = document.getElementById("app");
	if (!app) throw new Error("No #app element");
	if (window.PREACT_STREAM) {
		hydrateRoot(app, h(Router, { initialPayload: payload }));
	} else {
		createRoot(app).render(h(Router, { initialPayload: payload }));
	}
});

const cache = new Map<string, ComponentType>();

const decodeClientReference: DecodeClientReferenceFunction<
	EncodedClientReference
> = (encoded) => {
	const key = `${encoded[0]}:${encoded[1]}`;
	const cached = cache.get(key);
	if (cached) {
		return cached;
	}
	const Comp = lazy(() =>
		loadClientReference(encoded).then((Component: any) => ({
			default: Component,
		})),
	) as ComponentType;
	cache.set(key, Comp);
	return Comp;
};

const decodeServerReference: DecodeServerReferenceFunction = (id) => {
	return async (...args: unknown[]) => {
		const encoded = encode(args);
		const body =
			window.location.protocol !== "https:"
				? await readToString(encoded)
				: encoded.pipeThrough(new TextEncoderStream());
		const response = await fetch(window.location.href, {
			body,
			headers: {
				accept: "text/x-component",
				"content-type": "text/x-component",
				"psc-action": id,
			},
			method: "POST",
			duplex: "half",
		} as RequestInit & { duplex: "half" });
		if (!response.body) throw new Error("No body");
		const payload = await decode<ActionPayload>(
			response.body.pipeThrough(new TextDecoderStream()),
			{
				decodeClientReference,
				decodeServerReference,
			},
		);

		Promise.resolve(payload.root).then((root) => setPayload(root));

		return payload.result;
	};
};

const readToString = async (stream: ReadableStream<string>) => {
	const reader = stream.getReader();
	try {
		let result = "";
		while (true) {
			const { done, value } = await reader.read();
			if (done) {
				break;
			}
			result += value;
		}
		return result;
	} finally {
		reader.releaseLock();
	}
};
