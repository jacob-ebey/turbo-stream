import { describe, test, beforeEach } from "node:test";
import { expect } from "expect";
import {
	encode,
	decode,
	registerEncodePlugin,
	registerDecodePlugin,
	registerPlugin,
	clearGlobalPlugins,
	getGlobalEncodePluginCount,
	getGlobalDecodePluginCount,
} from "./turbo-stream.js";
import type { EncodePlugin, DecodePlugin } from "./turbo-stream.js";

describe("Global Plugin Registry", () => {
	beforeEach(() => {
		clearGlobalPlugins();
	});

	test("should register and use encode plugins globally", async () => {
		class CustomClass {
			constructor(public value: string) {}
		}

		// Register encode plugin
		registerEncodePlugin((value) => {
			if (value instanceof CustomClass) {
				return ["CustomClass", value.value];
			}
		});

		registerDecodePlugin((type, ...data) => {
			if (type === "CustomClass") {
				return { value: new CustomClass(data[0] as string) };
			}
		});

		const obj = new CustomClass("test");
		const stream = encode(obj);
		const chunks: string[] = [];
		const reader = stream.getReader();
		
		try {
			while (true) {
				const { done, value } = await reader.read();
				if (done) break;
				chunks.push(value);
			}
		} finally {
			reader.releaseLock();
		}

		const encoded = chunks.join("");
		expect(encoded).toContain('P["CustomClass","test"]');

		const decodedStream = new ReadableStream<string>({
			start(controller) {
				controller.enqueue(encoded);
				controller.close();
			},
		});

		const decoded = await decode(decodedStream);
		expect(decoded).toBeInstanceOf(CustomClass);
		expect((decoded as CustomClass).value).toBe("test");
	});

	test("should register both encode and decode plugins at once", async () => {
		class TestClass {
			constructor(public data: number) {}
		}

		const encodePlugin: EncodePlugin = (value) => {
			if (value instanceof TestClass) {
				return ["TestClass", value.data];
			}
		};

		const decodePlugin: DecodePlugin = (type, ...data) => {
			if (type === "TestClass") {
				return { value: new TestClass(data[0] as number) };
			}
		};

		registerPlugin(encodePlugin, decodePlugin);

		const original = new TestClass(42);
		const stream = encode(original);
		const chunks: string[] = [];
		const reader = stream.getReader();
		
		try {
			while (true) {
				const { done, value } = await reader.read();
				if (done) break;
				chunks.push(value);
			}
		} finally {
			reader.releaseLock();
		}

		const encoded = chunks.join("");
		const decodedStream = new ReadableStream<string>({
			start(controller) {
				controller.enqueue(encoded);
				controller.close();
			},
		});

		const decoded = await decode(decodedStream);
		expect(decoded).toBeInstanceOf(TestClass);
		expect((decoded as TestClass).data).toBe(42);
	});

	test("should combine global plugins with local plugins", async () => {
		class GlobalClass {
			constructor(public name: string) {}
		}

		class LocalClass {
			constructor(public id: number) {}
		}

		registerEncodePlugin((value) => {
			if (value instanceof GlobalClass) {
				return ["GlobalClass", value.name];
			}
		});

		registerDecodePlugin((type, ...data) => {
			if (type === "GlobalClass") {
				return { value: new GlobalClass(data[0] as string) };
			}
		});

		const localEncodePlugin: EncodePlugin = (value) => {
			if (value instanceof LocalClass) {
				return ["LocalClass", value.id];
			}
		};

		const localDecodePlugin: DecodePlugin = (type, ...data) => {
			if (type === "LocalClass") {
				return { value: new LocalClass(data[0] as number) };
			}
		};

		const globalObj = new GlobalClass("global");

		const stream = encode(globalObj, { plugins: [localEncodePlugin] });
		const chunks: string[] = [];
		const reader = stream.getReader();
		
		try {
			while (true) {
				const { done, value } = await reader.read();
				if (done) break;
				chunks.push(value);
			}
		} finally {
			reader.releaseLock();
		}

		const encoded = chunks.join("");
		expect(encoded).toContain('P["GlobalClass","global"]');

		const decodedStream = new ReadableStream<string>({
			start(controller) {
				controller.enqueue(encoded);
				controller.close();
			},
		});

		const decoded = await decode(decodedStream, { plugins: [localDecodePlugin] });
		expect(decoded).toBeInstanceOf(GlobalClass);
		expect((decoded as GlobalClass).name).toBe("global");
	});

	test("should track plugin counts correctly", () => {
		expect(getGlobalEncodePluginCount()).toBe(0);
		expect(getGlobalDecodePluginCount()).toBe(0);

		const encodePlugin: EncodePlugin = () => false;
		const decodePlugin: DecodePlugin = () => false;

		registerEncodePlugin(encodePlugin);
		expect(getGlobalEncodePluginCount()).toBe(1);
		expect(getGlobalDecodePluginCount()).toBe(0);

		registerDecodePlugin(decodePlugin);
		expect(getGlobalEncodePluginCount()).toBe(1);
		expect(getGlobalDecodePluginCount()).toBe(1);

		clearGlobalPlugins();
		expect(getGlobalEncodePluginCount()).toBe(0);
		expect(getGlobalDecodePluginCount()).toBe(0);
	});

	test("should handle multiple plugins in order", async () => {
		class MultiClass {
			constructor(public value: string) {}
		}

		registerEncodePlugin((value) => {
			if (value instanceof MultiClass) {
				return ["MultiClass1", value.value + "_1"];
			}
		});

		registerEncodePlugin((value) => {
			if (value instanceof MultiClass) {
				return ["MultiClass2", value.value + "_2"];
			}
		});

		registerDecodePlugin((type, ...data) => {
			if (type === "MultiClass1") {
				return { value: new MultiClass(data[0] as string) };
			}
		});

		const obj = new MultiClass("test");
		const stream = encode(obj);
		const chunks: string[] = [];
		const reader = stream.getReader();
		
		try {
			while (true) {
				const { done, value } = await reader.read();
				if (done) break;
				chunks.push(value);
			}
		} finally {
			reader.releaseLock();
		}

		const encoded = chunks.join("");
		expect(encoded).toContain('P["MultiClass1","test_1"]');
		expect(encoded).not.toContain('P["MultiClass2"');
	});

	test("should work with complex nested objects", async () => {
		class User {
			constructor(public name: string, public age: number) {}
		}

		class Post {
			constructor(public title: string, public author: User) {}
		}

		registerEncodePlugin((value) => {
			if (value instanceof User) {
				return ["User", value.name, value.age];
			}
			if (value instanceof Post) {
				return ["Post", value.title, value.author];
			}
		});

		registerDecodePlugin((type, ...data) => {
			if (type === "User") {
				return { value: new User(data[0] as string, data[1] as number) };
			}
			if (type === "Post") {
				return { value: new Post(data[0] as string, data[1] as User) };
			}
		});

		const user = new User("John", 30);
		const post = new Post("Hello World", user);

		const stream = encode(post);
		const chunks: string[] = [];
		const reader = stream.getReader();
		
		try {
			while (true) {
				const { done, value } = await reader.read();
				if (done) break;
				chunks.push(value);
			}
		} finally {
			reader.releaseLock();
		}

		const encoded = chunks.join("");
		expect(encoded).toContain('P["Post","Hello World"');

		const decodedStream = new ReadableStream<string>({
			start(controller) {
				controller.enqueue(encoded);
				controller.close();
			},
		});

		const decoded = await decode(decodedStream);
		expect(decoded).toBeInstanceOf(Post);
		expect((decoded as Post).title).toBe("Hello World");
		expect((decoded as Post).author).toBeInstanceOf(User);
		expect((decoded as Post).author.name).toBe("John");
		expect((decoded as Post).author.age).toBe(30);
	});
}); 