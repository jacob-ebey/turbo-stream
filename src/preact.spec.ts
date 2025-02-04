import { describe, test, type Mock } from "node:test";
import { expect } from "expect";
import {
	Component,
	Fragment,
	h,
	isValidElement,
	options,
	type VNode,
} from "preact";
import { Suspense } from "preact/compat";
import { renderToString, renderToStringAsync } from "preact-render-to-string";

import type { DecodePlugin } from "./decode.js";
import type { EncodePlugin } from "./encode.js";
import {
	decode,
	encode,
	type EncodeServerReferenceFunction,
	type ClientReference,
	type ServerReference,
	type DecodeClientReferenceFunction,
	type EncodeClientReferenceFunction,
	type DecodeServerReferenceFunction,
} from "./preact.js";

const CLIENT_REFERENCE = Symbol.for("preact.client.reference");
const SERVER_REFERENCE = Symbol.for("preact.server.reference");

async function renderWithError(vnode: VNode) {
	(options as any).errorBoundaries = true;
	try {
		return await renderToStringAsync(vnode);
	} finally {
		(options as any).errorBoundaries = false;
	}
}

function quickDecode<T>(
	value: T,
	encodePlugins: EncodePlugin[] = [],
	decodePlugins: DecodePlugin[] = [],
	encodeClientReference?: EncodeClientReferenceFunction<any, any>,
	decodeClientReference?: DecodeClientReferenceFunction<any>,
	encodeServerReference?: EncodeServerReferenceFunction<any>,
	decodeServerReference?: DecodeServerReferenceFunction,
): Promise<T> {
	const encoded = encode(value, {
		encodeClientReference,
		encodeServerReference,
		plugins: encodePlugins,
	});
	return decode(
		// make sure we can process streams character by character
		encoded.pipeThrough(
			new TransformStream({
				transform(chunk, controller) {
					for (const char of chunk) {
						controller.enqueue(char);
					}
				},
			}),
		),
		{
			decodeClientReference,
			decodeServerReference,
			plugins: decodePlugins,
		},
	);
}

const compareExcludeKeys = (
	object1: unknown,
	object2: unknown,
	excludeKeys: string[] = [],
): void => {
	if (Array.isArray(object1)) {
		for (let i = 0; i < object1.length; i++) {
			compareExcludeKeys(object1[i], (object2 as unknown[])[i], excludeKeys);
		}
	}
	if (typeof object1 !== "object" || object1 === null) {
		expect(object1).toBe(object2);
	} else {
		for (const key of Object.keys(object1)) {
			if (!excludeKeys.includes(key)) {
				try {
					expect(object2).toHaveProperty(key);
				} catch (cause) {
					throw new Error(`Key ${key} not found in object2`, { cause });
				}
				try {
					compareExcludeKeys(
						(object1 as any)[key],
						(object2 as any)[key],
						excludeKeys,
					);
				} catch (cause) {
					throw new Error(`Key ${key} does not match`, { cause });
				}
			}
		}
	}
};

describe("preact", () => {
	test("can encode and decode basic elements", async () => {
		const listItems = [
			h("li", { key: 1 }, "foo"),
			h("li", { key: 2 }, "bar"),
			h("li", { key: 3 }, "baz"),
		];
		const tree = h("div", { id: "foo" }, h("ul", null, listItems));
		const decoded = await quickDecode(tree);
		compareExcludeKeys(decoded, tree, ["__v"]);
		expect(renderToString(decoded)).toBe(renderToString(tree));
	});

	test("can encode and decode basic function component", async () => {
		const rendered = h("div", null, "Hello, world!");
		function SayHello({ name }: { name: string }) {
			return rendered;
		}
		const tree = h(SayHello, { name: "world" });
		const decoded = await quickDecode(tree);
		compareExcludeKeys(decoded, rendered, ["__v"]);
		expect(renderToString(decoded)).toBe(renderToString(rendered));
	});

	test("can encode and decode nested function components", async () => {
		const hello = h("div", null, "Hello, world!");
		function SayHello({ name }: { name: string }) {
			return hello;
		}
		function Say({ name }: { name: string }) {
			return [hello, h(SayHello, { name })];
		}
		const tree = h(Say, { name: "world" });
		const decoded = await quickDecode(tree);
		compareExcludeKeys(decoded, [hello, hello], ["__v"]);
		expect(renderToString(decoded)).toBe(renderToString(tree));
	});

	// test("can encode and decode async function component", async () => {
	// 	const rendered = h("div", null, "Hello, world!");
	// 	async function SayHello({ name }: { name: string }) {
	// 		return rendered;
	// 	}
	// 	const tree = h(SayHello, { name: "world" });
	// 	const decoded = await quickDecode(tree);
	// 	expect(isValidElement(decoded)).toBe(true);
	// 	expect(await renderToStringAsync(decoded)).toBe("<div>Hello, world!</div>");
	// });

	test("can encode and decode client reference", async (t) => {
		const ClientComponent = ({ name }: { name: string }) => {
			return h("div", null, `Hello, ${name}!`);
		};
		ClientComponent.$$typeof = CLIENT_REFERENCE;
		ClientComponent.$$id = "ClientComponent";
		const tree = h(ClientComponent, { name: "world" });

		const encodeClientReference = t.mock.fn<
			EncodeClientReferenceFunction<ClientReference & { $$id: string }, any>
		>((reference) => {
			return [reference.$$id];
		});
		const decodeClientReference = t.mock.fn<
			DecodeClientReferenceFunction<[string]>
		>(([id]) => {
			if (id !== "ClientComponent") {
				throw new Error("Invalid client reference");
			}
			return ClientComponent;
		});

		const decoded = await quickDecode(
			tree,
			undefined,
			undefined,
			encodeClientReference,
			decodeClientReference,
		);
		expect(encodeClientReference.mock.callCount()).toBe(1);
		expect(decodeClientReference.mock.callCount()).toBe(1);
		expect(isValidElement(decoded)).toBe(true);
		expect(await renderToStringAsync(h(Fragment, {}, decoded))).toBe(
			"<div>Hello, world!</div>",
		);
	});

	test("can encode and decode multiple client references", async (t) => {
		const ClientComponent = ({ name }: { name: string }) => {
			return h("div", null, `Hello, ${name}!`);
		};
		ClientComponent.$$typeof = CLIENT_REFERENCE;
		ClientComponent.$$id = "ClientComponent";
		const tree = h(Fragment, {}, [
			h(ClientComponent, { name: "world" }),
			h(ClientComponent, { name: "world" }),
		]);

		const encodeClientReference = t.mock.fn<
			EncodeClientReferenceFunction<ClientReference & { $$id: string }, any>
		>((reference) => {
			return [reference.$$id];
		});
		const decodeClientReference = t.mock.fn<
			DecodeClientReferenceFunction<[string]>
		>(([id]) => {
			if (id !== "ClientComponent") {
				throw new Error("Invalid client reference");
			}
			return ClientComponent;
		});

		const decoded = await quickDecode(
			tree,
			undefined,
			undefined,
			encodeClientReference,
			decodeClientReference,
		);
		expect(encodeClientReference.mock.callCount()).toBe(2);
		expect(decodeClientReference.mock.callCount()).toBe(2);
		expect(isValidElement(decoded)).toBe(true);
		expect(await renderToStringAsync(decoded)).toBe(
			"<div>Hello, world!</div><div>Hello, world!</div>",
		);
	});

	test("can encode and decode server reference", async (t) => {
		const serverFunction = t.mock.fn((name: string) => name) as unknown as Mock<
			(...args: any[]) => any
		> &
			ServerReference & { $$id: string };
		serverFunction.$$typeof = SERVER_REFERENCE;
		serverFunction.$$id = "serverFunction";

		const encodeServerReference = t.mock.fn<
			EncodeServerReferenceFunction<ServerReference & { $$id: string }>
		>((reference) => {
			return reference.$$id;
		});

		const decodeServerReference = t.mock.fn<DecodeServerReferenceFunction>(
			(encoded) => {
				if (encoded !== "serverFunction") {
					throw new Error("Invalid server reference");
				}
				return (...args) =>
					(serverFunction as (...args: any[]) => any).apply(null, args);
			},
		);

		const decoded = await quickDecode(
			serverFunction,
			undefined,
			undefined,
			undefined,
			undefined,
			encodeServerReference,
			decodeServerReference,
		);
		expect(encodeServerReference.mock.callCount()).toBe(1);
		expect(decodeServerReference.mock.callCount()).toBe(1);
		expect(typeof decoded).toBe("function");
		expect(decoded("world")).toBe("world");
		expect(serverFunction.mock.callCount()).toBe(1);
	});

	test("can encode and decode server reference as vdom event handler", async (t) => {
		const serverFunction = t.mock.fn((name: string) => name) as unknown as Mock<
			(...args: any[]) => any
		> &
			ServerReference & { $$id: string };
		serverFunction.$$typeof = SERVER_REFERENCE;
		serverFunction.$$id = "serverFunction";

		const encodeServerReference = t.mock.fn<
			EncodeServerReferenceFunction<ServerReference & { $$id: string }>
		>((reference) => {
			return reference.$$id;
		});

		const decodeServerReference = t.mock.fn<DecodeServerReferenceFunction>(
			(encoded) => {
				if (encoded !== "serverFunction") {
					throw new Error("Invalid server reference");
				}
				return (...args) =>
					(serverFunction as (...args: any[]) => any).apply(null, args);
			},
		);

		const button = h("button", { onClick: serverFunction });
		const decoded = await quickDecode(
			button,
			undefined,
			undefined,
			undefined,
			undefined,
			encodeServerReference,
			decodeServerReference,
		);
		expect(encodeServerReference.mock.callCount()).toBe(1);
		expect(decodeServerReference.mock.callCount()).toBe(1);
		compareExcludeKeys(decoded, button, ["__v", "onClick"]);
		expect(typeof decoded.props.onClick).toBe("function");
		expect(decoded.props.onClick("world")).toBe("world");
		expect(serverFunction.mock.callCount()).toBe(1);
	});

	test("can propagate errors", async () => {
		function Thrower(): string {
			throw new Error("fail");
		}

		class ErrorBoundary extends Component<
			{ children?: VNode },
			{ error: Error | null }
		> {
			constructor(props: { children?: VNode }) {
				super(props);
				this.state = { error: null };
			}
			componentDidCatch(error: Error) {
				this.setState({ error });
			}

			render() {
				return this.state.error
					? h("p", null, this.state.error.message)
					: this.props.children;
			}
			static $$typeof: symbol = CLIENT_REFERENCE;
		}

		const decoded = await quickDecode(
			h(ErrorBoundary, null, h(Thrower, null)),
			undefined,
			undefined,
			() => ["ErrorBoundary"],
			() => ErrorBoundary,
		);
		expect(await renderWithError(h(Fragment, null, decoded))).toBe(
			"<p>&lt;redacted></p>",
		);
	});
});
