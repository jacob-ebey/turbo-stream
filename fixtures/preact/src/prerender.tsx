import type { VNode } from "preact";
import { Suspense } from "preact/compat";
import { renderToStringAsync } from "preact-render-to-string";

import {
	decode,
	type DecodeClientReferenceFunction,
} from "../../../src/preact";

import type { EncodedClientReference } from "./server";

async function readToText(stream: ReadableStream<string>) {
	let result = "";
	let reader = stream.getReader();
	try {
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
}

export async function prerender(
	html: string,
	payloadStream: ReadableStream<string>,
) {
	const [payloadStreamA, payloadStreamB] = payloadStream.tee();
	const [payload, inlinePayload] = await Promise.all([
		decode<VNode>(payloadStreamA, {
			decodeClientReference,
		}),
		readToText(payloadStreamB),
	]);
	const rendered = await renderToStringAsync(
		<>
			<Suspense fallback="">{payload}</Suspense>
			<script
				dangerouslySetInnerHTML={{
					__html: `window.PREACT_STREAM = new ReadableStream({ start(c) { c.enqueue(${escapeHtml(JSON.stringify(inlinePayload))}); c.close(); } });`,
				}}
			/>
		</>,
	);
	return html.replace('<div id="app">', `<div id="app">${rendered}`);
}

const decodeClientReference: DecodeClientReferenceFunction<
	EncodedClientReference
> = async ([id]) => {
	return () => "Client Reference";
};

// This escapeHtml utility is based on https://github.com/zertosh/htmlescape
// License: https://github.com/zertosh/htmlescape/blob/0527ca7156a524d256101bb310a9f970f63078ad/LICENSE

// We've chosen to inline the utility here to reduce the number of npm dependencies we have,
// slightly decrease the code size compared the original package and make it esm compatible.

const ESCAPE_LOOKUP: { [match: string]: string } = {
	"&": "\\u0026",
	">": "\\u003e",
	"<": "\\u003c",
	"\u2028": "\\u2028",
	"\u2029": "\\u2029",
};

const ESCAPE_REGEX = /[&><\u2028\u2029]/g;

export function escapeHtml(html: string) {
	return html.replace(ESCAPE_REGEX, (match) => ESCAPE_LOOKUP[match]);
}
