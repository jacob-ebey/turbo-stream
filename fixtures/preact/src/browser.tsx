import { h, type ComponentType, type VNode } from "preact";
import { useState, useLayoutEffect, useEffect } from "preact/hooks";
import { lazy, Suspense } from "preact/compat";
import { createRoot, hydrateRoot } from "preact/compat/client";

import {
	decode,
	type DecodeClientReferenceFunction,
} from "../../../src/preact";
// @ts-expect-error - no types
import { loadClientReference } from "virtual:preact-server/client";

import type { EncodedClientReference } from "./server";

declare global {
	interface Window {
		PREACT_STREAM?: ReadableStream<string>;
	}
}

let setPayload: (payload: VNode) => void;

function Root({ initialPayload }: { initialPayload: VNode }) {
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
	return <Suspense fallback={payload.last}>{payload.current}</Suspense>;
}

(window.PREACT_STREAM
	? Promise.resolve(window.PREACT_STREAM)
	: fetch(window.location.href, {
			headers: {
				accept: "text/x-component",
			},
		}).then((r) => r.body?.pipeThrough(new TextDecoderStream()))
).then(async (payloadStream) => {
	if (!payloadStream) throw new Error("No body");
	const payload = await decode<VNode>(payloadStream, {
		decodeClientReference,
	});
	const app = document.getElementById("app");
	if (!app) throw new Error("No #app element");
	if (window.PREACT_STREAM) {
		hydrateRoot(app, h(Root, { initialPayload: payload }));
	} else {
		createRoot(app).render(h(Root, { initialPayload: payload }));
	}

	if (window.navigation) {
		window.navigation.addEventListener("navigate", (event) => {
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
					const response = await fetch(event.destination.url, {
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
					});
					setPayload(payload);
				},
			});
		});
	}
});

const cache = new Map<string, ComponentType>();

const decodeClientReference: DecodeClientReferenceFunction<
	EncodedClientReference
> = ([id, name]) => {
	const key = `${id}:${name}`;
	const cached = cache.get(key);
	if (cached) {
		return cached;
	}
	const Comp = lazy(() =>
		loadClientReference(id, name).then((Component: any) => ({
			default: Component,
		})),
	) as ComponentType;
	cache.set(key, Comp);
	return Comp;
};
