import {
	encode,
	type ClientReference,
	type EncodeClientReferenceFunction,
} from "../../../src/preact";

import { Counter } from "./counter";

async function App() {
	return (
		<main>
			<h1>Hello, Server!</h1>
			<p>This is an example of PSC (Preact Server Components)</p>

			<Counter />
		</main>
	);
}

export const handleRequest = async (request: Request) => {
	const payloadStream = encode(<App />, {
		encodeClientReference,
	});
	return new Response(payloadStream.pipeThrough(new TextEncoderStream()), {
		headers: {
			"Content-Type": "text/x-component",
		},
	});
};

type ClientReferenceImp = ClientReference & { $$id: string };
export type EncodedClientReference = [id: string];

const encodeClientReference: EncodeClientReferenceFunction<
	ClientReferenceImp,
	EncodedClientReference
> = (reference) => {
	return [reference.$$id];
};
