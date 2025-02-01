import { describe, test } from "node:test";
import { expect } from "expect";

import { encode, encodeSync, type EncodePlugin } from "./encode.js";
import {
	STR_ARRAY_BUFFER,
	STR_BIG_INT_64_ARRAY,
	STR_BIG_UINT_64_ARRAY,
	STR_BLOB,
	STR_DATA_VIEW,
	STR_DATE,
	STR_FILE,
	STR_FLOAT_32_ARRAY,
	STR_FLOAT_64_ARRAY,
	STR_FORM_DATA,
	STR_INFINITY,
	STR_INT_16_ARRAY,
	STR_INT_32_ARRAY,
	STR_INT_8_ARRAY,
	STR_NaN,
	STR_NEGATIVE_INFINITY,
	STR_NEGATIVE_ZERO,
	STR_REGEXP,
	STR_UINT_16_ARRAY,
	STR_UINT_32_ARRAY,
	STR_UINT_8_ARRAY,
	STR_UINT_8_ARRAY_CLAMPED,
	STR_URL,
	SUPPORTS_FILE,
} from "./shared.js";

describe("encodeSync", () => {
	function quickEncode(
		value: unknown,
		expectedPromises = 0,
		plugins: EncodePlugin[] = [],
	): string {
		const chunks: string[] = [];
		const refs = new WeakMap();
		const promises = new WeakMap();
		const promiseFrames: unknown[] = [];
		const counters = { refId: 0, promiseId: 0 };
		const redactErrors = true;

		encodeSync(
			value,
			chunks,
			refs,
			promises,
			promiseFrames,
			counters,
			plugins,
			redactErrors,
		);

		expect(counters.promiseId).toBe(expectedPromises);
		expect(promiseFrames.length).toBe(expectedPromises);

		return chunks.join("");
	}

	test("undefined", () => {
		expect(quickEncode(undefined)).toBe("undefined");
	});

	test("null", () => {
		expect(quickEncode(null)).toBe("null");
	});

	test("true", () => {
		expect(quickEncode(true)).toBe("true");
	});

	test("false", () => {
		expect(quickEncode(false)).toBe("false");
	});

	test("NaN", () => {
		expect(quickEncode(Number.NaN)).toBe(STR_NaN);
	});

	test("Infinity", () => {
		expect(quickEncode(Number.POSITIVE_INFINITY)).toBe(STR_INFINITY);
	});

	test("-Infinity", () => {
		expect(quickEncode(Number.NEGATIVE_INFINITY)).toBe(STR_NEGATIVE_INFINITY);
	});

	test("0", () => {
		expect(quickEncode(0)).toBe("0");
	});

	test("-0", () => {
		expect(quickEncode(-0)).toBe(STR_NEGATIVE_ZERO);
	});

	test("42", () => {
		expect(quickEncode(42)).toBe("42");
	});

	test("-42", () => {
		expect(quickEncode(-42)).toBe("-42");
	});

	test("3.14", () => {
		expect(quickEncode(3.14)).toBe("3.14");
	});

	test("-3.14", () => {
		expect(quickEncode(-3.14)).toBe("-3.14");
	});

	test("bigint", () => {
		expect(quickEncode(42n)).toBe("b42");
	});

	test("symbol", () => {
		expect(quickEncode(Symbol.for("daSymbol"))).toBe('s"daSymbol"');
	});

	test("empty string", () => {
		expect(quickEncode("")).toBe('""');
	});

	test("string", () => {
		expect(quickEncode("Hello, world!")).toBe('"Hello, world!"');
	});

	test("string with special characters", () => {
		expect(quickEncode("\\hello\nworld\\")).toBe('"\\\\hello\\nworld\\\\"');
	});

	test("Date", () => {
		const date = new Date("2021-01-01T00:00:00Z");
		expect(quickEncode(date)).toBe(`${STR_DATE}"2021-01-01T00:00:00.000Z"`);
	});

	test("empty object", () => {
		expect(quickEncode({})).toBe("{}");
	});

	test("empty array", () => {
		expect(quickEncode([])).toBe("[]");
	});

	test("object with one key", () => {
		expect(quickEncode({ a: 1 })).toBe('{"a":1}');
	});

	test("array with one element", () => {
		expect(quickEncode([1])).toBe("[1]");
	});

	test("object with multiple keys", () => {
		expect(quickEncode({ a: 1, b: 2 })).toBe('{"a":1,"b":2}');
	});

	test("array with multiple elements", () => {
		expect(quickEncode([1, 2])).toBe("[1,2]");
	});

	test("object with nested object", () => {
		expect(quickEncode({ a: { b: 1 } })).toBe('{"a":{"b":1}}');
	});

	test("array with nested array", () => {
		expect(quickEncode([[1]])).toBe("[[1]]");
	});

	test("object with nested array", () => {
		expect(quickEncode({ a: [1] })).toBe('{"a":[1]}');
	});

	test("array with nested object", () => {
		expect(quickEncode([{ a: 1 }])).toBe('[{"a":1}]');
	});

	test("object with circular reference", () => {
		const obj: Record<string, unknown> = {};
		obj.a = obj;

		expect(quickEncode(obj)).toBe('{"a":@0}');
	});

	test("array with circular reference", () => {
		const arr: unknown[] = [];
		arr.push(arr);

		expect(quickEncode(arr)).toBe("[@0]");
	});

	test("error", () => {
		expect(quickEncode(new Error("error"))).toBe(
			'E{"name":"Error","message":"<redacted>","stack":"<redacted>","cause":undefined}',
		);
	});

	test("promise", () => {
		const promise = Promise.resolve(42);
		expect(quickEncode(promise, 1)).toBe("$0");
	});

	test("promise reference", () => {
		const promise = Promise.resolve(42);
		expect(quickEncode([promise, promise], 1)).toBe("[$0,$0]");
	});

	test("function", () => {
		expect(quickEncode(() => {})).toBe("undefined");
	});

	test("plugins", () => {
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
		expect(
			quickEncode(a, 0, [
				(value) => {
					if (value instanceof A) {
						return ["A", value.a, value.b];
					}
					if (value instanceof B) {
						return ["B", value.b];
					}
				},
			]),
		).toBe('P["A","a",P["B","b"]]');
	});

	test("iterable", () => {
		const iterable = {
			*[Symbol.iterator]() {
				yield 1;
				yield 2;
				yield 3;
			},
		};
		expect(quickEncode(iterable)).toBe("[1,2,3]");
	});

	test("async iterable", () => {
		const asyncIterable = {
			async *[Symbol.asyncIterator]() {
				yield 1;
				yield 2;
				yield 3;
			},
		};
		expect(quickEncode(asyncIterable, 1)).toBe("*0");
	});

	test("set", () => {
		const set = new Set([1, 2, 3]);
		expect(quickEncode(set)).toBe("S[1,2,3]");
	});

	test("map", () => {
		const map = new Map([
			["a", 1],
			["b", 2],
			["c", 3],
		]);
		expect(quickEncode(map)).toBe('M[["a",1],["b",2],["c",3]]');
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
		expect(await quickEncode(readableStream, 1)).toBe("R0");
	});
});

describe("encode", () => {
	async function quickEncode(value: unknown, plugins: EncodePlugin[] = []) {
		const stream = encode(value, { plugins });
		const chunks: string[] = [];

		const reader = stream.getReader();
		try {
			while (true) {
				const { done, value } = await reader.read();
				if (done) {
					break;
				}
				chunks.push(value);
			}
		} finally {
			reader.releaseLock();
		}

		return chunks.join("");
	}

	test("undefined", async () => {
		expect(await quickEncode(undefined)).toBe("undefined\n");
	});

	test("null", async () => {
		expect(await quickEncode(null)).toBe("null\n");
	});

	test("true", async () => {
		expect(await quickEncode(true)).toBe("true\n");
	});

	test("false", async () => {
		expect(await quickEncode(false)).toBe("false\n");
	});

	test("NaN", async () => {
		expect(await quickEncode(Number.NaN)).toBe("NaN\n");
	});

	test("Infinity", async () => {
		expect(await quickEncode(Number.POSITIVE_INFINITY)).toBe("I\n");
	});

	test("-Infinity", async () => {
		expect(await quickEncode(Number.NEGATIVE_INFINITY)).toBe("i\n");
	});

	test("0", async () => {
		expect(await quickEncode(0)).toBe("0\n");
	});

	test("-0", async () => {
		expect(await quickEncode(-0)).toBe("z\n");
	});

	test("42", async () => {
		expect(await quickEncode(42)).toBe("42\n");
	});

	test("-42", async () => {
		expect(await quickEncode(-42)).toBe("-42\n");
	});

	test("3.14", async () => {
		expect(await quickEncode(3.14)).toBe("3.14\n");
	});

	test("-3.14", async () => {
		expect(await quickEncode(-3.14)).toBe("-3.14\n");
	});

	test("bigint", async () => {
		expect(await quickEncode(42n)).toBe("b42\n");
	});

	test("symbol", async () => {
		expect(await quickEncode(Symbol.for("daSymbol"))).toBe('s"daSymbol"\n');
	});

	test("function", async () => {
		expect(await quickEncode(() => {})).toBe("undefined\n");
	});

	test("empty string", async () => {
		expect(await quickEncode("")).toBe('""\n');
	});

	test("string", async () => {
		expect(await quickEncode("Hello, world!")).toBe('"Hello, world!"\n');
	});

	test("string with special characters", async () => {
		expect(await quickEncode("\\hello\nworld\\")).toBe(
			'"\\\\hello\\nworld\\\\"\n',
		);
	});

	test("Date", async () => {
		const date = new Date("2021-01-01T00:00:00Z");
		expect(await quickEncode(date)).toBe(
			`${STR_DATE}"2021-01-01T00:00:00.000Z"\n`,
		);
	});

	test("Date reference", async () => {
		const date = new Date("2021-01-01T00:00:00Z");
		expect(await quickEncode([date, date])).toBe(
			`[${STR_DATE}"2021-01-01T00:00:00.000Z",@1]\n`,
		);
	});

	test("URL", async () => {
		const url = new URL("https://example.com");
		expect(await quickEncode(url)).toBe(`${STR_URL}"https://example.com/"\n`);
	});

	test("URL reference", async () => {
		const url = new URL("https://example.com");
		expect(await quickEncode([url, url])).toBe(
			`[${STR_URL}"https://example.com/",@1]\n`,
		);
	});

	test("empty object", async () => {
		expect(await quickEncode({})).toBe("{}\n");
	});

	test("object with one key", async () => {
		expect(await quickEncode({ a: 1 })).toBe('{"a":1}\n');
	});

	test("object with multiple keys", async () => {
		expect(await quickEncode({ a: 1, b: 2 })).toBe('{"a":1,"b":2}\n');
	});

	test("object with nested object", async () => {
		expect(await quickEncode({ a: { b: 1 } })).toBe('{"a":{"b":1}}\n');
	});

	test("object with nested array", async () => {
		expect(await quickEncode({ a: [1] })).toBe('{"a":[1]}\n');
	});

	test("object with circular reference", async () => {
		const obj: Record<string, unknown> = {};
		obj.a = obj;

		expect(await quickEncode(obj)).toBe('{"a":@0}\n');
	});

	test("empty array", async () => {
		expect(await quickEncode([])).toBe("[]\n");
	});

	test("array with one element", async () => {
		expect(await quickEncode([1])).toBe("[1]\n");
	});

	test("array with multiple elements", async () => {
		expect(await quickEncode([1, 2])).toBe("[1,2]\n");
	});

	test("array with nested array", async () => {
		expect(await quickEncode([[1]])).toBe("[[1]]\n");
	});

	test("array with nested object", async () => {
		expect(await quickEncode([{ a: 1 }])).toBe('[{"a":1}]\n');
	});

	test("array with circular reference", async () => {
		const arr: unknown[] = [];
		arr.push(arr);

		expect(await quickEncode(arr)).toBe("[@0]\n");
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
		expect(await quickEncode(values)).toBe(
			`[undefined,null,true,false,NaN,I,i,z,0,42,-42,3.14,-3.14,b42,{},[\"1\",2,\"3\",s\"daSymbol\",D\"2021-01-01T00:00:00.000Z\",U\"https://example.com/\"]]\n`,
		);
	});

	test("iterable", async () => {
		const iterable = {
			*[Symbol.iterator]() {
				yield 1;
				yield 2;
				yield 3;
			},
		};
		expect(await quickEncode(iterable)).toBe("[1,2,3]\n");
	});

	test("set", async () => {
		const set = new Set([1, 2, 3]);
		expect(await quickEncode(set)).toBe("S[1,2,3]\n");
	});

	test("set reference", async () => {
		const set = new Set<unknown>([1, 2, 3]);
		set.add(set);
		expect(await quickEncode(set)).toBe("S[1,2,3,@0]\n");
	});

	test("map", async () => {
		const map = new Map([
			["a", 1],
			["b", 2],
			["c", 3],
		]);
		expect(await quickEncode(map)).toBe('M[["a",1],["b",2],["c",3]]\n');
	});

	test("map reference", async () => {
		const map = new Map<unknown, unknown>([
			["a", 1],
			["b", 2],
			["c", 3],
		]);
		map.set(map, map);
		expect(await quickEncode(map)).toBe('M[["a",1],["b",2],["c",3],[@0,@0]]\n');
	});

	test("RegExp", async () => {
		const regexp = /abc/g;
		expect(await quickEncode(regexp)).toBe(`${STR_REGEXP}["abc","g"]\n`);
	});

	test("RegExp reference", async () => {
		const regexp = /abc/g;
		expect(await quickEncode([regexp, regexp])).toBe(
			`[${STR_REGEXP}["abc","g"],@1]\n`,
		);
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
		expect(
			await quickEncode(a, [
				(value) => {
					if (value instanceof A) {
						return ["A", value.a, value.b];
					}
					if (value instanceof B) {
						return ["B", value.b];
					}
				},
			]),
		).toBe('P["A","a",P["B","b"]]\n');
	});

	test("promise", async () => {
		const promise = Promise.resolve(42);
		expect(await quickEncode(promise)).toBe("$0\n0:42\n");
	});

	test("rejected promise value", async () => {
		const promise = Promise.reject(42);
		expect(await quickEncode(promise)).toBe("$0\n0!42\n");
	});

	test("rejected promise error", async () => {
		const promise = Promise.reject(new Error("rejected"));
		expect(await quickEncode(promise)).toBe(
			'$0\n0!E{"name":"Error","message":"<redacted>","stack":"<redacted>","cause":undefined}\n',
		);
	});

	test("promise reference", async () => {
		const promise = Promise.resolve(42);
		expect(await quickEncode([promise, promise])).toBe("[$0,$0]\n0:42\n");
	});

	test("async iterable", async () => {
		const asyncIterable = {
			async *[Symbol.asyncIterator]() {
				yield 1;
				yield 2;
				yield 3;
			},
		};
		expect(await quickEncode(asyncIterable)).toBe("*0\n0:1\n0:2\n0:3\n0\n");
	});

	test("async iterable reference", async () => {
		const asyncIterable = {
			async *[Symbol.asyncIterator]() {
				yield 1;
				yield 2;
				yield 3;
			},
		};
		expect(await quickEncode([asyncIterable, asyncIterable])).toBe(
			"[*0,*0]\n0:1\n0:2\n0:3\n0\n",
		);
	});

	test("async iterable error", async () => {
		const asyncIterable = {
			async *[Symbol.asyncIterator]() {
				yield 1;
				yield 2;
				throw new Error("error");
			},
		};
		expect(await quickEncode(asyncIterable)).toBe(
			'*0\n0:1\n0:2\n0!E{"name":"Error","message":"<redacted>","stack":"<redacted>","cause":undefined}\n',
		);
	});

	test("async iterable of async iterables", async () => {
		const asyncIterable = {
			async *[Symbol.asyncIterator]() {
				yield {
					async *[Symbol.asyncIterator]() {
						yield 1;
						yield 2;
					},
				};
				yield {
					async *[Symbol.asyncIterator]() {
						yield 3;
						yield 4;
					},
				};
			},
		};
		expect(await quickEncode(asyncIterable)).toBe(
			"*0\n0:*1\n1:1\n0:*2\n1:2\n2:3\n0\n1\n2:4\n2\n",
		);
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
		expect(await quickEncode(readableStream)).toBe(
			'R0\n0:"a"\n0:"b"\n0:"c"\n0\n',
		);
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
		expect(await quickEncode([readableStream, readableStream])).toBe(
			'[R0,R0]\n0:"a"\n0:"b"\n0:"c"\n0\n',
		);
	});

	test("multiple streams", async () => {
		const readableStreamA = new ReadableStream({
			start(controller) {
				controller.enqueue("a");
				controller.enqueue("b");
				controller.enqueue("c");
				controller.close();
			},
		});
		const readableStreamB = new ReadableStream({
			start(controller) {
				controller.enqueue(1);
				controller.enqueue(2);
				controller.enqueue(3);
				controller.close();
			},
		});

		expect(await quickEncode([readableStreamA, readableStreamB])).toBe(
			'[R0,R1]\n0:"a"\n1:1\n0:"b"\n1:2\n0:"c"\n1:3\n0\n1\n',
		);
	});

	test("ArrayBuffer", async () => {
		const arrayBuffer = new TextEncoder().encode("Hello, world!").buffer;
		expect(await quickEncode(arrayBuffer)).toBe(
			`${STR_ARRAY_BUFFER}"${btoa("Hello, world!")}"\n`,
		);
	});

	test("Int8Array", async () => {
		const uint8Array = new TextEncoder().encode("Hello, world!");
		const int8Array = new Int8Array(uint8Array);
		expect(await quickEncode(int8Array)).toBe(
			`${STR_INT_8_ARRAY}"${btoa("Hello, world!")}"\n`,
		);
	});

	test("Uint8Array", async () => {
		const uint8Array = new TextEncoder().encode("Hello, world!");
		expect(await quickEncode(uint8Array)).toBe(
			`${STR_UINT_8_ARRAY}"${btoa("Hello, world!")}"\n`,
		);
	});

	test("Uint8ClampedArray", async () => {
		const uint8Array = new TextEncoder().encode("Hello, world!");
		const uint8ClampedArray = new Uint8ClampedArray(uint8Array);
		expect(await quickEncode(uint8ClampedArray)).toBe(
			`${STR_UINT_8_ARRAY_CLAMPED}"${btoa("Hello, world!")}"\n`,
		);
	});

	test("Int16Array", async () => {
		const int16Array = new Int16Array([1, 2, 3]);
		expect(await quickEncode(int16Array)).toBe(
			`${STR_INT_16_ARRAY}"AQACAAMA"\n`,
		);
	});

	test("Uint16Array", async () => {
		const int16Array = new Uint16Array([1, 2, 3]);
		expect(await quickEncode(int16Array)).toBe(
			`${STR_UINT_16_ARRAY}"AQACAAMA"\n`,
		);
	});

	test("Int32Array", async () => {
		const int32Array = new Int32Array([1, 2, 3]);
		expect(await quickEncode(int32Array)).toBe(
			`${STR_INT_32_ARRAY}"AQAAAAIAAAADAAAA"\n`,
		);
	});

	test("Uint32Array", async () => {
		const int32Array = new Uint32Array([1, 2, 3]);
		expect(await quickEncode(int32Array)).toBe(
			`${STR_UINT_32_ARRAY}"AQAAAAIAAAADAAAA"\n`,
		);
	});

	test("Float32Array", async () => {
		const float32Array = new Float32Array([1.1, 2.2, 3.3]);
		expect(await quickEncode(float32Array)).toBe(
			`${STR_FLOAT_32_ARRAY}"zcyMP83MDEAzM1NA"\n`,
		);
	});

	test("Float64Array", async () => {
		const float64Array = new Float64Array([1.1, 2.2, 3.3]);
		expect(await quickEncode(float64Array)).toBe(
			`${STR_FLOAT_64_ARRAY}"mpmZmZmZ8T+amZmZmZkBQGZmZmZmZgpA"\n`,
		);
	});

	test("BigInt64Array", async () => {
		const bigInt64Array = new BigInt64Array([1n, 2n, 3n]);
		expect(await quickEncode(bigInt64Array)).toBe(
			`${STR_BIG_INT_64_ARRAY}"AQAAAAAAAAACAAAAAAAAAAMAAAAAAAAA"\n`,
		);
	});

	test("BigUint64Array", async () => {
		const bigUint64Array = new BigUint64Array([1n, 2n, 3n]);
		expect(await quickEncode(bigUint64Array)).toBe(
			`${STR_BIG_UINT_64_ARRAY}"AQAAAAAAAAACAAAAAAAAAAMAAAAAAAAA"\n`,
		);
	});

	test("DataView", async () => {
		const arrayBuffer = new TextEncoder().encode("Hello, world!").buffer;
		const dataView = new DataView(arrayBuffer);
		expect(await quickEncode(dataView)).toBe(
			`${STR_DATA_VIEW}"${btoa("Hello, world!")}"\n`,
		);
	});

	test("Blob", async () => {
		const blob = new Blob(["Hello, world!"], { type: "text/plain" });
		expect(await quickEncode(blob)).toBe(
			`${STR_BLOB}{"promise":$0,"size":13,"type":"text/plain"}\n0:A"SGVsbG8sIHdvcmxkIQ=="\n`,
		);
	});

	if (SUPPORTS_FILE) {
		test("File", async () => {
			const file = new File(["Hello, world!"], "hello.txt", {
				type: "text/plain",
				lastModified: 1000,
			});
			expect(await quickEncode(file)).toBe(
				`${STR_FILE}{"promise":$0,"size":13,"type":"text/plain","name":"hello.txt","lastModified":1000}\n0:A"SGVsbG8sIHdvcmxkIQ=="\n`,
			);
		});
	}

	test("FormData", async () => {
		const formData = new FormData();
		formData.append("a", "1");
		formData.append("b", "2");
		formData.append(
			"file",
			SUPPORTS_FILE
				? new File(["Hello, world!"], "hello.txt", {
						type: "text/plain",
						lastModified: 1000,
					})
				: new Blob(["Hello, world!"], { type: "text/plain" }),
		);
		if (SUPPORTS_FILE) {
			expect(await quickEncode(formData)).toBe(
				`${STR_FORM_DATA}[["a","1"],["b","2"],["file",${STR_FILE}{"promise":$0,"size":13,"type":"text/plain","name":"hello.txt","lastModified":1000}]]\n0:A"SGVsbG8sIHdvcmxkIQ=="\n`,
			);
		} else {
			expect(await quickEncode(formData)).toBe(
				`${STR_FORM_DATA}[["a","1"],["b","2"],["file",${STR_BLOB}{"promise":$0,"size":13,"type":"text/plain"}]]\n0:A"SGVsbG8sIHdvcmxkIQ=="\n`,
			);
		}
	});
});
