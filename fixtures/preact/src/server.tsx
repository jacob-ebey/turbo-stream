import type { VNode } from "preact";
import {
	decode,
	encode,
	type ClientReference,
	type EncodeClientReferenceFunction,
	type EncodeServerReferenceFunction,
	type ServerReference,
} from "turbo-stream/preact";
// @ts-expect-error - no types
import { loadServerReference } from "virtual:preact-server/server";

import { App } from "./app";

export type ActionPayload = {
	result: unknown;
	root: VNode;
};

export const handleRequest = async (request: Request) => {
	const actionId = request.headers.get("psc-action");
	if (actionId && request.method === "POST" && request.body) {
		const reference = (await loadServerReference(actionId)) as (
			...args: unknown[]
		) => unknown;
		const args = await decode<unknown[]>(
			request.body.pipeThrough(new TextDecoderStream()),
		);
		const result = (async () => reference(...args))();
		try {
			await result;
		} catch {}

		const payload: ActionPayload = {
			root: <App url={new URL(request.url)} />,
			result,
		};

		const payloadStream = encode(payload, {
			encodeClientReference,
			encodeServerReference,
		});
		return new Response(payloadStream.pipeThrough(new TextEncoderStream()), {
			headers: {
				"Content-Type": "text/x-component",
			},
		});
	}

	const payloadStream = encode(<App url={new URL(request.url)} />, {
		encodeClientReference,
		encodeServerReference,
	});
	return new Response(payloadStream.pipeThrough(new TextEncoderStream()), {
		headers: {
			"Content-Type": "text/x-component",
		},
	});
};

type ClientReferenceImp = ClientReference & {
	$$id: string;
	$$name: string;
	$$chunks?: string[];
};
export type EncodedClientReference = [
	id: string,
	name: string,
	...chunks: string[],
];

const encodeClientReference: EncodeClientReferenceFunction<
	ClientReferenceImp,
	EncodedClientReference
> = (reference) => {
	if (!reference.$$id || !reference.$$name) {
		throw new Error("Client reference must have $$id and $$name properties");
	}
	return [reference.$$id, reference.$$name, ...(reference.$$chunks ?? [])];
};

type ServerReferenceImp = ServerReference & {
	$$id: string;
	$$name: string;
};

const encodeServerReference: EncodeServerReferenceFunction<
	ServerReferenceImp
> = (reference) => {
	return `${reference.$$id}#${reference.$$name}`;
};
