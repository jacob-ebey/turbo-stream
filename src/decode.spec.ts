import { describe, test } from "node:test";
import { expect } from "expect";

import { decode, type DecodePlugin } from "./decode.js";
import { encode, type EncodePlugin } from "./encode.js";
import { Deferred, STR_REDACTED, SUPPORTS_FILE } from "./shared.js";

function quickDecode<T>(
	value: T,
	encodePlugins: EncodePlugin[] = [],
	decodePlugins: DecodePlugin[] = [],
): Promise<T> {
	const encoded = encode(value, { plugins: encodePlugins });
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
			plugins: decodePlugins,
		},
	);
}

function getCallStackSize(): number {
	let counter = 0;

	const recurse = (): number => {
		counter++;
		try {
			return recurse();
		} catch (error) {
			return counter - 1;
		}
	};

	return recurse();
}

describe("decode", () => {
	test("undefined", async () => {
		expect(await quickDecode(undefined)).toBe(undefined);
	});

	test("null", async () => {
		expect(await quickDecode(null)).toBe(null);
	});

	test("true", async () => {
		expect(await quickDecode(true)).toBe(true);
	});

	test("false", async () => {
		expect(await quickDecode(false)).toBe(false);
	});

	test("NaN", async () => {
		expect(await quickDecode(Number.NaN)).toBe(Number.NaN);
	});

	test("Infinity", async () => {
		expect(await quickDecode(Number.POSITIVE_INFINITY)).toBe(
			Number.POSITIVE_INFINITY,
		);
	});

	test("-Infinity", async () => {
		expect(await quickDecode(Number.NEGATIVE_INFINITY)).toBe(
			Number.NEGATIVE_INFINITY,
		);
	});

	test("0", async () => {
		expect(await quickDecode(0)).toBe(0);
	});

	test("-0", async () => {
		expect(await quickDecode(-0)).toBe(-0);
	});

	test("42", async () => {
		expect(await quickDecode(42)).toBe(42);
	});

	test("-42", async () => {
		expect(await quickDecode(-42)).toBe(-42);
	});

	test("3.14", async () => {
		expect(await quickDecode(3.14)).toBe(3.14);
	});

	test("-3.14", async () => {
		expect(await quickDecode(3.14)).toBe(3.14);
	});

	test("bigint", async () => {
		expect(await quickDecode(42n)).toBe(42n);
	});

	test("symbol", async () => {
		const symbol = Symbol.for("daSymbol");
		const decoded = await quickDecode(symbol);
		expect(decoded).toBe(symbol);
	});

	test("empty string", async () => {
		expect(await quickDecode("")).toBe("");
	});

	test("string", async () => {
		expect(await quickDecode("Hello, world!")).toBe("Hello, world!");
	});

	test("string with special characters", async () => {
		expect(await quickDecode("\\hello\nworld\\")).toBe("\\hello\nworld\\");
	});

	test("Date", async () => {
		const date = new Date();
		const decoded = await quickDecode(date);
		expect(decoded).toEqual(date);
		expect(decoded).toBeInstanceOf(Date);
	});

	test("Date reference", async () => {
		const date = new Date();
		const decoded = await quickDecode([date, date]);
		expect(decoded).toEqual([date, date]);
		expect(decoded[0]).toBe(decoded[1]);
	});

	test("URL", async () => {
		const url = new URL("https://example.com");
		const decoded = await quickDecode(url);
		expect(decoded).toBeInstanceOf(URL);
		expect(decoded.href).toEqual(url.href);
	});

	test("URL reference", async () => {
		const url = new URL("https://example.com");
		const decoded = await quickDecode([url, url]);
		expect(decoded).toEqual([url, url]);
		expect(decoded[0]).toBe(decoded[1]);
	});

	test("empty object", async () => {
		expect(await quickDecode({})).toEqual({});
	});

	test("object with one key", async () => {
		expect(await quickDecode({ key: "value" })).toEqual({ key: "value" });
	});

	test("object with multiple keys", async () => {
		expect(await quickDecode({ a: 1, b: 2 })).toEqual({ a: 1, b: 2 });
	});

	test("object with nested object", async () => {
		expect(await quickDecode({ a: { b: 1 } })).toEqual({ a: { b: 1 } });
	});

	test("object with nested array", async () => {
		expect(await quickDecode({ a: [1] })).toEqual({ a: [1] });
	});

	test("object with circular reference", async () => {
		const obj: Record<string, unknown> = {};
		obj.a = obj;
		const decoded = await quickDecode(obj);
		expect(decoded).toEqual(obj);
		expect(decoded.a).toBe(decoded);
	});

	test("empty array", async () => {
		expect(await quickDecode([])).toEqual([]);
	});

	test("array with one element", async () => {
		expect(await quickDecode([1])).toEqual([1]);
	});

	test("array with multiple elements", async () => {
		expect(await quickDecode([1, 2])).toEqual([1, 2]);
	});

	test("array with nested array", async () => {
		expect(await quickDecode([[1]])).toEqual([[1]]);
	});

	test("array with nested object", async () => {
		expect(await quickDecode([{ a: 1 }])).toEqual([{ a: 1 }]);
	});

	test("array with circular references", async () => {
		const arr: unknown[] = [];
		arr.push(arr);
		const decoded = await quickDecode(arr);
		expect(decoded).toEqual(decoded);
		expect(decoded[0]).toBe(decoded);
	});

	test("array of values", async () => {
		const values = [
			undefined,
			null,
			true,
			false,
			Number.NaN,
			Number.POSITIVE_INFINITY,
			Number.NEGATIVE_INFINITY,
			-0,
			0,
			42,
			-42,
			3.14,
			-3.14,
			42n,
			{},
			[
				"1",
				2,
				"3",
				Symbol.for("daSymbol"),
				new Date("2021-01-01"),
				new URL("https://example.com"),
			],
		];
		expect(await quickDecode(values)).toEqual(values);
	});

	test("iterable", async () => {
		const iterable = {
			*[Symbol.iterator]() {
				yield 1;
				yield 2;
				yield 3;
			},
		};
		expect(await quickDecode(iterable)).toEqual([1, 2, 3]);
	});

	test("plugins", async () => {
		class A {
			a: string;
			b: B;
			constructor(a: string, b: B) {
				this.a = a;
				this.b = b;
			}
		}
		class B {
			b: string;
			constructor(b: string) {
				this.b = b;
			}
		}
		const a = new A("a", new B("b"));
		const decoded = await quickDecode(
			a,
			[
				(value) => {
					if (value instanceof A) {
						return ["A", value.a, value.b];
					}
					if (value instanceof B) {
						return ["B", value.b];
					}
				},
			],
			[
				(type, ...values) => {
					if (type === "A") {
						return { value: new A(values[0] as string, values[1] as B) };
					}
					if (type === "B") {
						return { value: new B(values[0] as string) };
					}
				},
			],
		);
		expect(decoded).toBeInstanceOf(A);
		expect(decoded.a).toBe("a");
		expect(decoded.b).toBeInstanceOf(B);
		expect(decoded.b.b).toBe("b");
	});

	test("set", async () => {
		const set = new Set([1, 2, 3]);
		const decoded = await quickDecode(set);
		expect(decoded).toBeInstanceOf(Set);
		expect(Array.from(decoded)).toEqual(Array.from(set));
	});

	test("set reference", async () => {
		const set = new Set<unknown>([1, 2, 3]);
		const decoded = await quickDecode(set);
		expect(decoded).toBeInstanceOf(Set);
		expect(Array.from(decoded).slice(-1)).toEqual(Array.from(set).slice(-1));
		expect(decoded.has(decoded));
	});

	test("map", async () => {
		const map = new Map([
			["a", 1],
			["b", 2],
			["c", 3],
		]);
		const decoded = await quickDecode(map);
		expect(decoded).toBeInstanceOf(Map);
		expect(Array.from(decoded)).toEqual(Array.from(map));
	});

	test("map reference", async () => {
		const map = new Map<unknown, unknown>([
			["a", 1],
			["b", 2],
			["c", 3],
		]);
		map.set(map, map);
		const decoded = await quickDecode(map);
		expect(decoded).toBeInstanceOf(Map);
		expect(Array.from(decoded).slice(-1)).toEqual(Array.from(map).slice(-1));
		expect(decoded.get(decoded)).toBe(decoded);
	});

	test("RegExp", async () => {
		const regexp = /abc/g;
		const decoded = await quickDecode(regexp);
		expect(decoded).toBeInstanceOf(RegExp);
		expect(decoded.source).toBe("abc");
		expect(decoded.flags).toBe("g");
	});

	test("RegExp reference", async () => {
		const regexp = /abc/g;
		const decoded = await quickDecode([regexp, regexp]);
		expect(decoded[0]).toBeInstanceOf(RegExp);
		expect(decoded[0].source).toBe("abc");
		expect(decoded[0].flags).toBe("g");
		expect(decoded[1]).toBeInstanceOf(RegExp);
		expect(decoded[1].source).toBe("abc");
		expect(decoded[1].flags).toBe("g");
		// TODO: Do we want to support this?
		// expect(decoded[0]).toBe(decoded[1]);
	});

	test("Error", async () => {
		const decoded = await quickDecode(new Error("message"));
		expect(decoded).toBeInstanceOf(Error);
		expect(decoded.name).toBe("Error");
		expect(decoded.message).toBe(STR_REDACTED);
		expect(decoded.stack).toBe(STR_REDACTED);
	});

	test("promise", async () => {
		const promise = Promise.resolve(42);
		expect(await quickDecode(promise)).toBe(42);
	});

	test("rejected promise value", async () => {
		const promise = Promise.reject(42);
		await expect(quickDecode(promise)).rejects.toBe(42);
	});

	test("rejected promise error", async () => {
		const promise = Promise.reject(new Error("message"));
		const decodePromise = quickDecode(promise);
		await expect(decodePromise).rejects.toBeInstanceOf(Error);
		await expect(decodePromise).rejects.toThrow(STR_REDACTED);
		const error = await decodePromise.catch((error) => error);
		expect(error.name).toBe("Error");
		expect(error.message).toBe(STR_REDACTED);
		expect(error.stack).toBe(STR_REDACTED);
	});

	test("promise reference", async () => {
		const promise = Promise.resolve(42);
		const decoded = await quickDecode([promise, promise]);
		expect(decoded[0]).toBeInstanceOf(Promise);
		expect(await decoded[0]).toBe(42);
		expect(decoded[1]).toBe(decoded[0]);
	});

	test("async iterable", async () => {
		const asyncIterable = {
			async *[Symbol.asyncIterator]() {
				yield 1;
				yield 2;
				yield 3;
			},
		};
		const iterable = await quickDecode(asyncIterable);
		expect(typeof iterable[Symbol.asyncIterator]).toBe("function");
		const values: unknown[] = [];
		for await (const value of iterable) {
			values.push(value);
		}
		expect(values).toEqual([1, 2, 3]);
	});

	test("async iterable reference", async () => {
		const asyncIterable = {
			async *[Symbol.asyncIterator]() {
				yield 1;
				yield 2;
				yield 3;
			},
		};
		const [iterable, iterableB] = await quickDecode([
			asyncIterable,
			asyncIterable,
		]);
		expect(typeof iterable[Symbol.asyncIterator]).toBe("function");
		const values: unknown[] = [];
		for await (const value of iterable) {
			values.push(value);
		}
		expect(values).toEqual([1, 2, 3]);
		expect(iterableB).toBe(iterable);
	});

	test("async iterable error", async () => {
		const asyncIterable = {
			async *[Symbol.asyncIterator]() {
				yield 1;
				yield 2;
				throw new Error("error");
			},
		};

		const iterable = await quickDecode(asyncIterable);
		for await (const value of iterable) {
			expect(value).toBe(1);
			break;
		}
		for await (const value of iterable) {
			expect(value).toBe(2);
			break;
		}
		try {
			for await (const _ of iterable) {
				throw new Error("should not reach here");
			}
		} catch (error) {
			expect(error).toBeInstanceOf(Error);
			expect((error as Error).message).toBe(STR_REDACTED);
			expect((error as Error).stack).toBe(STR_REDACTED);
		}
	});

	test("async itereable of async iterables", async () => {
		const deferred = new Deferred<void>();
		const asyncIterableRoot = {
			async *[Symbol.asyncIterator]() {
				yield {
					async *[Symbol.asyncIterator]() {
						yield 1;
						await deferred.promise;
						yield 2;
					},
				};
				yield {
					async *[Symbol.asyncIterator]() {
						yield 3;
						await deferred.promise;
						yield 4;
					},
				};
			},
		};
		const iterableRoot = await quickDecode(asyncIterableRoot);
		expect(typeof iterableRoot[Symbol.asyncIterator]).toBe("function");
		const iterables: AsyncIterable<unknown>[] = [];
		for await (const iterable of iterableRoot) {
			expect(typeof iterable[Symbol.asyncIterator]).toBe("function");
			iterables.push(iterable);
		}
		expect(iterables.length).toBe(2);
		const [iterableA, iterableB] = iterables;
		for await (const value of iterableB) {
			expect(value).toBe(3);
			break;
		}
		for await (const value of iterableA) {
			expect(value).toBe(1);
			break;
		}
		deferred.resolve();
		for await (const value of iterableB) {
			expect(value).toBe(4);
			break;
		}
		for await (const value of iterableA) {
			expect(value).toBe(2);
			break;
		}
		for await (const _ of iterableA) {
			throw new Error("should not reach here");
		}
		for await (const _ of iterableB) {
			throw new Error("should not reach here");
		}
	});

	test("readable stream", async () => {
		const readableStream = new ReadableStream({
			start(controller) {
				controller.enqueue("a");
				controller.enqueue("b");
				controller.enqueue("c");
				controller.close();
			},
		});
		const decoded = await quickDecode(readableStream);
		expect(decoded).toBeInstanceOf(ReadableStream);
		const reader = decoded.getReader();
		const values: string[] = [];
		while (true) {
			const { done, value } = await reader.read();
			if (done) {
				break;
			}
			values.push(value);
		}
		expect(values).toEqual(["a", "b", "c"]);
	});

	test("readable stream reference", async () => {
		const readableStream = new ReadableStream({
			start(controller) {
				controller.enqueue("a");
				controller.enqueue("b");
				controller.enqueue("c");
				controller.close();
			},
		});
		const [decodedA, decodedB] = await quickDecode([
			readableStream,
			readableStream,
		]);
		expect(decodedA).toBeInstanceOf(ReadableStream);
		expect(decodedB).toBe(decodedA);
		const reader = decodedA.getReader();
		const values: string[] = [];
		while (true) {
			const { done, value } = await reader.read();
			if (done) {
				break;
			}
			values.push(value);
		}
		expect(values).toEqual(["a", "b", "c"]);
	});

	test("readable stream error", async () => {
		const deferred = new Deferred<void>();
		const readableStream = new ReadableStream({
			async start(controller) {
				controller.enqueue("a");
				controller.enqueue("b");
				await deferred.promise;
				controller.error(new Error("error"));
			},
		});
		const decoded = await quickDecode(readableStream);
		expect(decoded).toBeInstanceOf(ReadableStream);
		const reader = decoded.getReader();
		expect(await reader.read()).toEqual({ done: false, value: "a" });
		expect(await reader.read()).toEqual({ done: false, value: "b" });
		deferred.resolve();
		await expect(reader.read()).rejects.toBeInstanceOf(Error);
		await expect(reader.read()).rejects.toThrow(STR_REDACTED);
	});

	test("readable stream of readable streams", async () => {
		const deferred = new Deferred<void>();
		const readableStreamRoot = new ReadableStream({
			start(controller) {
				controller.enqueue(
					new ReadableStream({
						async start(controller) {
							controller.enqueue("a");
							await deferred.promise;
							controller.enqueue("b");
							controller.close();
						},
					}),
				);
				controller.enqueue(
					new ReadableStream({
						async start(controller) {
							controller.enqueue("c");
							await deferred.promise;
							controller.enqueue("d");
							controller.close();
						},
					}),
				);
				controller.close();
			},
		});
		const decoded = await quickDecode(readableStreamRoot);
		expect(decoded).toBeInstanceOf(ReadableStream);
		const reader = decoded.getReader();
		const streams: ReadableStream<string>[] = [];
		while (true) {
			const { done, value } = await reader.read();
			if (done) {
				break;
			}
			streams.push(value);
		}
		expect(streams.length).toBe(2);
		const [streamA, streamB] = streams;
		const readerA = streamA.getReader();
		const readerB = streamB.getReader();
		expect(await readerB.read()).toEqual({ done: false, value: "c" });
		expect(await readerA.read()).toEqual({ done: false, value: "a" });
		deferred.resolve();
		expect(await readerB.read()).toEqual({ done: false, value: "d" });
		expect(await readerA.read()).toEqual({ done: false, value: "b" });
		expect(await readerB.read()).toEqual({ done: true });
		expect(await readerA.read()).toEqual({ done: true });
	});

	test("can encode and decode recursive promises beyond the maximum call stack size", async () => {
		let doubleMaxCallStackSize = Math.floor(getCallStackSize() * 2);
		expect(doubleMaxCallStackSize).toBeGreaterThan(0);

		type Nested = { i: number; next: Promise<Nested> | null };
		const input: Nested = { i: 0, next: null };
		let current: Nested = input;
		for (let i = 1; i < doubleMaxCallStackSize; i++) {
			const next = { i, next: null };
			current.next = Promise.resolve(next);
			current = next;
		}

		let decoded = await quickDecode(input);
		let last: Nested = decoded;
		for (let i = 1; i < doubleMaxCallStackSize; i++) {
			expect(last.i).toBe(i - 1);
			expect(last.next).not.toBeNull();
			last = (await last.next) as Nested;
		}
		expect(last.i).toBe(doubleMaxCallStackSize - 1);
		expect(last.next).toBeNull();
	});

	test("can encode and decode async iterables beyond the maximum call stack size", async () => {
		let doubleMaxCallStackSize = Math.floor(getCallStackSize() * 2);
		expect(doubleMaxCallStackSize).toBeGreaterThan(0);
		async function* asyncIterable() {
			for (let i = 0; i < doubleMaxCallStackSize; i++) {
				yield i;
			}
		}

		let decoded = await quickDecode(asyncIterable());
		let i = 0;
		for await (const value of decoded) {
			expect(value).toBe(i++);
		}
		expect(i).toBe(doubleMaxCallStackSize);
	});

	test("ArrayBuffer", async () => {
		const arrayBuffer = new TextEncoder().encode("Hello, world!").buffer;
		const decoded = await quickDecode(arrayBuffer);
		expect(decoded).toBeInstanceOf(ArrayBuffer);
		expect(decoded.byteLength).toBe(arrayBuffer.byteLength);
		const decodedText = new TextDecoder().decode(decoded);
		expect(decodedText).toBe("Hello, world!");
	});

	test("Int8Array", async () => {
		const int8Array = new Int8Array([-1, 2, 3]);
		const decoded = await quickDecode(int8Array);
		expect(decoded).toBeInstanceOf(Int8Array);
		expect(Array.from(decoded)).toEqual(Array.from(int8Array));
	});

	test("Uint8Array", async () => {
		const uint8Array = new TextEncoder().encode("Hello, world!");
		const decoded = await quickDecode(uint8Array);
		expect(decoded).toBeInstanceOf(Uint8Array);
		expect(Array.from(decoded)).toEqual(Array.from(uint8Array));
	});

	test("Uint8ClampedArray", async () => {
		const uint8Array = new TextEncoder().encode("Hello, world!");
		const uint8ClampedArray = new Uint8ClampedArray(uint8Array);
		const decoded = await quickDecode(uint8ClampedArray);
		expect(decoded).toBeInstanceOf(Uint8ClampedArray);
		expect(Array.from(decoded)).toEqual(Array.from(uint8ClampedArray));
	});

	test("Int16Array", async () => {
		const int16Array = new Int16Array([-1, 2, 3]);
		const decoded = await quickDecode(int16Array);
		expect(decoded).toBeInstanceOf(Int16Array);
		expect(Array.from(decoded)).toEqual(Array.from(int16Array));
	});

	test("Uint16Array", async () => {
		const int16Array = new Uint16Array([1, 2, 3]);
		const decoded = await quickDecode(int16Array);
		expect(decoded).toBeInstanceOf(Uint16Array);
		expect(Array.from(decoded)).toEqual(Array.from(int16Array));
	});

	test("Int32Array", async () => {
		const int32Array = new Int32Array([-1, 2, 3]);
		const decoded = await quickDecode(int32Array);
		expect(decoded).toBeInstanceOf(Int32Array);
		expect(Array.from(decoded)).toEqual(Array.from(int32Array));
	});

	test("Uint32Array", async () => {
		const int32Array = new Uint32Array([1, 2, 3]);
		const decoded = await quickDecode(int32Array);
		expect(decoded).toBeInstanceOf(Uint32Array);
		expect(Array.from(decoded)).toEqual(Array.from(int32Array));
	});

	test("Float32Array", async () => {
		const float32Array = new Float32Array([-1.1, 2.2, 3.3]);
		const decoded = await quickDecode(float32Array);
		expect(decoded).toBeInstanceOf(Float32Array);
		expect(Array.from(decoded)).toEqual(Array.from(float32Array));
	});

	test("Float64Array", async () => {
		const float64Array = new Float64Array([-1.1, 2.2, 3.3]);
		const decoded = await quickDecode(float64Array);
		expect(decoded).toBeInstanceOf(Float64Array);
		expect(Array.from(decoded)).toEqual(Array.from(float64Array));
	});

	test("BigInt64Array", async () => {
		const bigInt64Array = new BigInt64Array([-1n, 2n, 3n]);
		const decoded = await quickDecode(bigInt64Array);
		expect(decoded).toBeInstanceOf(BigInt64Array);
		expect(Array.from(decoded)).toEqual(Array.from(bigInt64Array));
	});

	test("BigUint64Array", async () => {
		const bigUint64Array = new BigUint64Array([1n, 2n, 3n]);
		const decoded = await quickDecode(bigUint64Array);
		expect(decoded).toBeInstanceOf(BigUint64Array);
		expect(Array.from(decoded)).toEqual(Array.from(bigUint64Array));
	});

	test("DataView", async () => {
		const arrayBuffer = new TextEncoder().encode("Hello, world!").buffer;
		const dataView = new DataView(arrayBuffer);
		const decoded = await quickDecode(dataView);
		expect(decoded).toBeInstanceOf(DataView);
		expect(decoded.byteLength).toBe(dataView.byteLength);
		expect(decoded.byteOffset).toBe(dataView.byteOffset);
		expect(decoded.buffer).toBeInstanceOf(ArrayBuffer);
		expect(decoded.buffer.byteLength).toBe(arrayBuffer.byteLength);
		expect(decoded.buffer.byteLength).toBe(arrayBuffer.byteLength);
		const decodedText = new TextDecoder().decode(decoded.buffer);
		expect(decodedText).toBe("Hello, world!");
	});

	test("Blob", async () => {
		const blob = new Blob(["Hello, world!"]);
		const decoded = await quickDecode(blob);
		expect(decoded).toBeInstanceOf(Blob);
		expect(decoded.size).toBe(blob.size);
		expect(decoded.type).toBe(blob.type);
		expect(await blob.text()).toBe("Hello, world!");
	});

	if (SUPPORTS_FILE) {
		test("File", async () => {
			const file = new File(["Hello, world!"], "file.txt", {
				type: "text/plain",
				lastModified: 1000,
			});
			const decoded = await quickDecode(file);
			expect(decoded).toBeInstanceOf(File);
			expect(decoded.size).toBe(file.size);
			expect(decoded.type).toBe(file.type);
			expect(decoded.name).toBe(file.name);
			expect(decoded.lastModified).toBe(file.lastModified);
			expect(await file.text()).toBe("Hello, world!");
		});
	}

	test("FormData", async () => {
		const formData = new FormData();
		formData.append("key", "value");
		formData.append("key", "value2");
		if (SUPPORTS_FILE) {
			formData.append(
				"file",
				new File(["Hello, world!"], "file.txt", {
					type: "text/plain",
					lastModified: 1000,
				}),
			);
		}
		const decoded = await quickDecode(formData);
		expect(decoded).toBeInstanceOf(FormData);
		expect(decoded.getAll("key")).toEqual(["value", "value2"]);
		if (SUPPORTS_FILE) {
			const file = decoded.get("file") as File;
			expect(file).toBeInstanceOf(File);
			expect(file.size).toBe(13);
			expect(file.type).toBe("text/plain");
			expect(file.name).toBe("file.txt");
			expect(file.lastModified).toBe(1000);
			expect(await file.text()).toBe("Hello, world!");
		}
	});
});
