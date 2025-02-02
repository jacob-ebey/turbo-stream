import { encode } from "../../../src/preact";

async function App() {
	return (
		<main>
			<h1>Hello, Server!</h1>
			<p>This is an example of PSC (Preact Server Components)</p>
		</main>
	);
}

export const handleRequest = async (request: Request) => {
	const payloadStream = encode(<App />);
	return new Response(payloadStream.pipeThrough(new TextEncoderStream()), {
		headers: {
			"Content-Type": "text/x-component",
		},
	});
};
