import {
	Deferred,
	DeferredAsyncIterable,
	DeferredReadableStream,
	TurboBlob,
	TurboFile,
} from "./shared.js";
export type DecodePlugin = (
	type: string,
	...data: unknown[]
) => { value: unknown } | false | null | undefined;

export type DecodeOptions = {
	plugins?: DecodePlugin[];
};

let MODE_UNKNOWN = 0 as const;
let MODE_NUMBER = 1 as const;
let MODE_STRING = 2 as const;
let MODE_ASYNC = 3 as const;
type ParseMode =
	| typeof MODE_UNKNOWN
	| typeof MODE_NUMBER
	| typeof MODE_STRING
	| typeof MODE_ASYNC;

let SUB_MODE_UNKNOWN = 0 as const;
let SUB_MODE_BIGINT = 1 as const;
let SUB_MODE_DATE = 2 as const;
let SUB_MODE_URL = 3 as const;
let SUB_MODE_SYMBOL = 4 as const;
let SUB_MODE_REFERENCE = 5 as const;
let SUB_MODE_OBJECT_KEY = 6 as const;
let SUB_MODE_PROMISE_ID = 7 as const;
let SUB_MODE_ASYNC_ITERABLE_ID = 8 as const;
let SUB_MODE_READABLE_STREAM_ID = 9 as const;
let SUB_MODE_ASYNC_STATUS = 10 as const;
let SUB_MODE_ARRAY_BUFFER = 11 as const;
let SUB_MODE_INT_8_ARRAY = 12 as const;
let SUB_MODE_UINT_8_ARRAY = 13 as const;
let SUB_MODE_UINT_8_ARRAY_CLAMPED = 14 as const;
let SUB_MODE_INT_16_ARRAY = 15 as const;
let SUB_MODE_UINT_16_ARRAY = 16 as const;
let SUB_MODE_INT_32_ARRAY = 17 as const;
let SUB_MODE_UINT_32_ARRAY = 18 as const;
let SUB_MODE_FLOAT_32_ARRAY = 19 as const;
let SUB_MODE_FLOAT_64_ARRAY = 20 as const;
let SUB_MODE_BIG_INT_64_ARRAY = 21 as const;
let SUB_MODE_BIG_UINT_64_ARRAY = 22 as const;
let SUB_MODE_DATA_VIEW = 23 as const;

type ParseSubMode =
	| typeof SUB_MODE_UNKNOWN
	| typeof SUB_MODE_BIGINT
	| typeof SUB_MODE_DATE
	| typeof SUB_MODE_URL
	| typeof SUB_MODE_SYMBOL
	| typeof SUB_MODE_REFERENCE
	| typeof SUB_MODE_OBJECT_KEY
	| typeof SUB_MODE_PROMISE_ID
	| typeof SUB_MODE_ASYNC_ITERABLE_ID
	| typeof SUB_MODE_READABLE_STREAM_ID
	| typeof SUB_MODE_ASYNC_STATUS
	| typeof SUB_MODE_ARRAY_BUFFER
	| typeof SUB_MODE_INT_8_ARRAY
	| typeof SUB_MODE_UINT_8_ARRAY
	| typeof SUB_MODE_UINT_8_ARRAY_CLAMPED
	| typeof SUB_MODE_INT_16_ARRAY
	| typeof SUB_MODE_UINT_16_ARRAY
	| typeof SUB_MODE_INT_32_ARRAY
	| typeof SUB_MODE_UINT_32_ARRAY
	| typeof SUB_MODE_FLOAT_32_ARRAY
	| typeof SUB_MODE_FLOAT_64_ARRAY
	| typeof SUB_MODE_BIG_INT_64_ARRAY
	| typeof SUB_MODE_BIG_UINT_64_ARRAY
	| typeof SUB_MODE_DATA_VIEW;

let ARRAY_TYPE_SET = 0 as const;
let ARRAY_TYPE_MAP = 1 as const;
let ARRAY_TYPE_REGEXP = 2 as const;
let ARRAY_TYPE_FORM_DATA = 3 as const;
let ARRAY_TYPE_PLUGIN = 4 as const;

type SetArray = unknown[] & {
	__type: typeof ARRAY_TYPE_SET;
	__ref: Set<unknown>;
};

type ReferenceArray = [string, ...unknown[]] & {
	__type:
		| typeof ARRAY_TYPE_PLUGIN
		| typeof ARRAY_TYPE_REGEXP
		| typeof ARRAY_TYPE_FORM_DATA;
	__id: number;
};

type MapArray = unknown[] & {
	__type: typeof ARRAY_TYPE_MAP;
	__ref: Map<unknown, unknown>;
};

type TypedArray = MapArray | ReferenceArray | SetArray;

let RELEASE_TYPE_VALUE = 0 as const;
let RELEASE_TYPE_OBJECT = 1 as const;
let RELEASE_TYPE_ARRAY = 2 as const;
let RELEASE_TYPE_PROMISE = 3 as const;

type ReleaseType =
	| typeof RELEASE_TYPE_VALUE
	| typeof RELEASE_TYPE_OBJECT
	| typeof RELEASE_TYPE_ARRAY
	| typeof RELEASE_TYPE_PROMISE;

export async function decode<T>(
	stream: ReadableStream<string>,
	{ plugins = [] }: DecodeOptions = {},
): Promise<T> {
	// Merge global plugins with provided plugins
	const allPlugins = [...plugins];
	
	// Lazy load global plugins to avoid circular dependencies
	let globalPluginsLoaded = false;
	const getGlobalPlugins = () => {
		if (!globalPluginsLoaded) {
			try {
				// Use require-like pattern for dynamic import in sync context
				const pluginRegistry = (globalThis as any).__turboStreamPluginRegistry;
				if (pluginRegistry?.getGlobalDecodePlugins) {
					allPlugins.push(...pluginRegistry.getGlobalDecodePlugins());
				}
			} catch {
				// If plugin registry is not available, continue without global plugins
			}
			globalPluginsLoaded = true;
		}
		return allPlugins;
	};
	let root: Deferred<T> | null = new Deferred();
	let references: Map<number, object> = new Map();
	let deferredValues: Map<
		number,
		Deferred<unknown> | DeferredAsyncIterable<unknown>
	> = new Map();
	let stack: unknown[] = [];
	let mode: ParseMode = MODE_UNKNOWN;
	let subMode: ParseSubMode = SUB_MODE_UNKNOWN;
	let buffer = "";
	let shouldSkip = 0;
	let lastChar: number | undefined;
	let numSlashes = 0;
	let hasSlashes = false;

	let releaseValue = (value: unknown, type: ReleaseType) => {
		if (type === RELEASE_TYPE_OBJECT) {
			if (typeof value !== "object" || value === null) {
				throw new Error("Expected object");
			}
		} else if (type === RELEASE_TYPE_ARRAY) {
			if (!Array.isArray(value)) {
				throw new Error("Expected array");
			}
		}

		if (
			Array.isArray(value) &&
			typeof (value as TypedArray).__type === "number"
		) {
			switch ((value as TypedArray).__type) {
				case ARRAY_TYPE_MAP:
					for (let [key, val] of value) {
						(value as MapArray).__ref.set(key, val);
					}
					value = (value as MapArray).__ref;
					break;
				case ARRAY_TYPE_SET:
					for (let val of value) {
						(value as SetArray).__ref.add(val);
					}
					value = (value as SetArray).__ref;
					break;
				case ARRAY_TYPE_REGEXP:
					value = new RegExp(value[0], value[1]);
					references.set((value as ReferenceArray).__id, value as object);
					break;
				case ARRAY_TYPE_FORM_DATA: {
					let formData = new FormData();
					for (let [key, val] of value as [string, FormDataEntryValue][]) {
						formData.append(key, val);
					}
					value = formData;
					references.set((value as ReferenceArray).__id, value as object);
					break;
				}
				case ARRAY_TYPE_PLUGIN: {
					let pluginHandled = false;
					let pluginsLength = getGlobalPlugins().length;
					for (let i = 0; i < pluginsLength; i++) {
						let result = getGlobalPlugins()[i](...(value as [string, ...unknown[]]));
						if (typeof result === "object" && result !== null) {
							value = result.value;
							pluginHandled = true;
							break;
						}
					}

					if (!pluginHandled) {
						// TODO: Should this throw? Should we have a way to recover from errors in the options?
						value = undefined;
					}
					break;
				}
			}
		}

		if (stack.length === 0) {
			if (root === null) {
				throw new Error("Unexpected root value");
			}
			if (root !== null) {
				root.resolve(value as T);
				root = null;
				return;
			}
		}

		let parent = stack[stack.length - 1];
		if (Array.isArray(parent)) {
			parent.push(value);
		} else if (typeof parent === "string") {
			stack.pop();
			(stack[stack.length - 1] as any)[parent] = value;
		} else if (typeof parent === "boolean") {
			stack.pop();
			let deferred = deferredValues.get(stack.pop() as number);
			if (!deferred) {
				throw new Error("Invalid stack state");
			}
			if (deferred instanceof Deferred) {
				if (parent) {
					deferred.resolve(value);
				} else {
					deferred.reject(value);
				}
			} else {
				if (parent) {
					deferred.yield(value);
				} else {
					deferred.reject(value);
				}
			}
		} else {
			throw new Error("Invalid stack state");
		}
	};

	let step = (chunk: string) => {
		let length = chunk.length;
		let charCode: number;
		let start = shouldSkip;
		shouldSkip = 0;
		let i = start;
		for (; i < length; i++) {
			charCode = chunk.charCodeAt(i);

			if (mode === MODE_UNKNOWN) {
				if (charCode === 44) {
					// ,
					mode = MODE_UNKNOWN;
					subMode = Array.isArray(stack[stack.length - 1])
						? SUB_MODE_UNKNOWN
						: SUB_MODE_OBJECT_KEY;
				} else if (charCode === 10) {
					// \n
					if (subMode === SUB_MODE_ASYNC_STATUS) {
						let id = stack.pop();
						if (typeof id !== "number") {
							throw new Error("Invalid stack state");
						}
						let deferred = deferredValues.get(id);
						(deferred as DeferredAsyncIterable<unknown>).resolve();
						deferredValues.delete(id);
					}
					mode = MODE_ASYNC;
					subMode = MODE_UNKNOWN;
					buffer = "";
				} else if (charCode === 123) {
					// {
					let newObj = {};
					stack.push(newObj);
					references.set(references.size, newObj);
					subMode = SUB_MODE_OBJECT_KEY;
				} else if (charCode === 125) {
					// }
					releaseValue(stack.pop(), 1);
				} else if (charCode === 91) {
					// [
					let newArr: unknown[] = [];
					stack.push(newArr);
					references.set(references.size, newArr);
				} else if (charCode === 83) {
					// S
					let newArr = [] as unknown as SetArray;
					newArr.__type = ARRAY_TYPE_SET;
					newArr.__ref = new Set();
					stack.push(newArr);
					references.set(references.size, newArr.__ref);
					i++;
				} else if (charCode === 77) {
					// M
					let newArr = [] as unknown as MapArray;
					newArr.__type = ARRAY_TYPE_MAP;
					newArr.__ref = new Map();
					stack.push(newArr);
					references.set(references.size, newArr.__ref);
					i++;
				} else if (charCode === 114) {
					// r
					let newArr = [] as unknown as ReferenceArray;
					newArr.__type = ARRAY_TYPE_REGEXP;
					newArr.__id = references.size;
					stack.push(newArr);
					references.set(newArr.__id, newArr);
					i++;
				} else if (charCode === 80) {
					// P
					let newArr = [] as unknown as ReferenceArray;
					newArr.__type = ARRAY_TYPE_PLUGIN;
					newArr.__id = references.size;
					stack.push(newArr);
					references.set(newArr.__id, newArr);
					i++;
				} else if (charCode === 93) {
					// ]
					releaseValue(stack.pop(), 2);
				} else if (charCode === 64) {
					// @
					subMode = SUB_MODE_REFERENCE;
				} else if (charCode === 68) {
					// D
					subMode = SUB_MODE_DATE;
				} else if (charCode === 85) {
					// U
					subMode = SUB_MODE_URL;
				} else if (charCode === 115) {
					// s
					subMode = SUB_MODE_SYMBOL;
				} else if (charCode === 34) {
					// "
					mode = MODE_STRING;
					buffer = "";
					lastChar = undefined;
					numSlashes = 0;
					hasSlashes = false;
				} else if (charCode === 36) {
					// $
					subMode = SUB_MODE_PROMISE_ID;
				} else if (charCode === 42) {
					// *
					subMode = SUB_MODE_ASYNC_ITERABLE_ID;
				} else if (charCode === 82) {
					// R
					subMode = SUB_MODE_READABLE_STREAM_ID;
				} else if (charCode === 58) {
					// :
					if (subMode !== SUB_MODE_ASYNC_STATUS) {
						throw new SyntaxError("Unexpected character: ':'");
					}
					stack.push(true);
				} else if (charCode === 33) {
					// !
					if (subMode !== SUB_MODE_ASYNC_STATUS) {
						throw new SyntaxError("Unexpected character: '!'");
					}
					stack.push(false);
				} else if (charCode === 117) {
					// u
					releaseValue(undefined, 0);
					subMode = SUB_MODE_UNKNOWN;
				} else if (charCode === 110) {
					// n
					i += 3;
					releaseValue(null, 0);
					subMode = SUB_MODE_UNKNOWN;
				} else if (charCode === 116) {
					// t
					i += 3;
					releaseValue(true, 0);
					subMode = SUB_MODE_UNKNOWN;
				} else if (charCode === 102) {
					// f
					i += 4;
					releaseValue(false, 0);
					subMode = SUB_MODE_UNKNOWN;
				} else if (charCode === 78) {
					// N
					i += 2;
					releaseValue(Number.NaN, 0);
					subMode = SUB_MODE_UNKNOWN;
				} else if (charCode === 73) {
					// I
					releaseValue(Number.POSITIVE_INFINITY, 0);
					subMode = SUB_MODE_UNKNOWN;
				} else if (charCode === 105) {
					// i
					releaseValue(Number.NEGATIVE_INFINITY, 0);
					subMode = SUB_MODE_UNKNOWN;
				} else if (charCode === 122) {
					// z
					releaseValue(-0, 0);
					subMode = SUB_MODE_UNKNOWN;
				} else if (charCode === 98) {
					// b
					subMode = SUB_MODE_BIGINT;
				} else if (
					charCode === 45 || // -
					charCode === 46 || // .
					(charCode >= 48 && charCode <= 57) // 0-9
				) {
					mode = MODE_NUMBER;
					buffer = chunk[i];
				} else if (charCode === 69) {
					// E
					let newObj = new Error();
					stack.push(newObj);
					references.set(references.size, newObj);
					subMode = SUB_MODE_OBJECT_KEY;
					i++;
				} else if (charCode === 70) {
					// F
					let newArr = [] as unknown as ReferenceArray;
					newArr.__type = ARRAY_TYPE_FORM_DATA;
					newArr.__id = references.size;
					stack.push(newArr);
					references.set(newArr.__id, newArr);
					i++;
				} else if (charCode === 75) {
					// K
					let newObj = new TurboBlob();
					stack.push(newObj);
					references.set(references.size, newObj);
					subMode = SUB_MODE_OBJECT_KEY;
					i++;
				} else if (charCode === 107) {
					// k
					let newObj = new TurboFile();
					stack.push(newObj);
					references.set(references.size, newObj);
					subMode = SUB_MODE_OBJECT_KEY;
					i++;
				} else if (charCode === 65) {
					// A
					subMode = SUB_MODE_ARRAY_BUFFER;
				} else if (charCode === 79) {
					// O
					subMode = SUB_MODE_INT_8_ARRAY;
				} else if (charCode === 111) {
					// o
					subMode = SUB_MODE_UINT_8_ARRAY;
				} else if (charCode === 67) {
					// C
					subMode = SUB_MODE_UINT_8_ARRAY_CLAMPED;
				} else if (charCode === 76) {
					// L
					subMode = SUB_MODE_INT_16_ARRAY;
				} else if (charCode === 108) {
					// l
					subMode = SUB_MODE_UINT_16_ARRAY;
				} else if (charCode === 71) {
					// G
					subMode = SUB_MODE_INT_32_ARRAY;
				} else if (charCode === 103) {
					// g
					subMode = SUB_MODE_UINT_32_ARRAY;
				} else if (charCode === 72) {
					// H
					subMode = SUB_MODE_FLOAT_32_ARRAY;
				} else if (charCode === 104) {
					// h
					subMode = SUB_MODE_FLOAT_64_ARRAY;
				} else if (charCode === 74) {
					// J
					subMode = SUB_MODE_BIG_INT_64_ARRAY;
				} else if (charCode === 106) {
					// j
					subMode = SUB_MODE_BIG_UINT_64_ARRAY;
				} else if (charCode === 86) {
					// V
					subMode = SUB_MODE_DATA_VIEW;
				} else {
					throw new SyntaxError(`Unexpected character: '${chunk[i]}'`);
				}
			} else if (mode === MODE_NUMBER || mode === MODE_ASYNC) {
				if (
					charCode === 45 || // -
					charCode === 46 || // .
					(charCode >= 48 && charCode <= 57) // 0-9
				) {
					buffer += chunk[i];
				} else {
					if (mode === MODE_ASYNC) {
						stack.push(Number(buffer));
						mode = MODE_UNKNOWN;
						subMode = SUB_MODE_ASYNC_STATUS;
						i--;
						continue;
					}

					if (subMode === SUB_MODE_PROMISE_ID) {
						let id = Number(buffer);
						let existing = deferredValues.get(id) as Deferred<unknown>;
						if (existing) {
							releaseValue(existing.promise, 0);
						} else {
							let deferred = new Deferred();
							deferredValues.set(id, deferred);
							releaseValue(deferred.promise, 0);
						}
					} else if (subMode === SUB_MODE_ASYNC_ITERABLE_ID) {
						let id = Number(buffer);
						let existing = deferredValues.get(
							id,
						) as DeferredAsyncIterable<unknown>;
						if (existing) {
							releaseValue(existing.iterable, 0);
						} else {
							let deferred = new DeferredAsyncIterable();
							deferredValues.set(id, deferred);
							releaseValue(deferred.iterable, 0);
						}
					} else if (subMode === SUB_MODE_READABLE_STREAM_ID) {
						let id = Number(buffer);
						let existing = deferredValues.get(
							id,
						) as DeferredReadableStream<unknown>;
						if (existing) {
							releaseValue(existing.readable, 0);
						} else {
							let deferred = new DeferredReadableStream();
							deferredValues.set(id, deferred);
							releaseValue(deferred.readable, 0);
						}
					} else {
						releaseValue(
							subMode === SUB_MODE_BIGINT
								? BigInt(buffer)
								: subMode === SUB_MODE_REFERENCE
									? references.get(Number(buffer))
									: Number(buffer),
							0,
						);
					}
					buffer = "";
					mode = MODE_UNKNOWN;
					subMode = SUB_MODE_UNKNOWN;
					i--;
				}
			} else if (mode === MODE_STRING) {
				let stringEnd = false;
				for (; i < length; i++) {
					charCode = chunk.charCodeAt(i);
					if (charCode !== 34 || (lastChar === 92 && numSlashes % 2 === 1)) {
						buffer += chunk[i];
						lastChar = charCode;
						if (lastChar === 92) {
							numSlashes++;
							hasSlashes = true;
						} else {
							numSlashes = 0;
						}
					} else {
						stringEnd = true;
						break;
					}
				}
				if (stringEnd) {
					let value = hasSlashes ? JSON.parse(`"${buffer}"`) : buffer;
					if (subMode === SUB_MODE_OBJECT_KEY) {
						stack.push(value);
						i++;
					} else {
						if (subMode === SUB_MODE_DATE) {
							value = new Date(value);
							references.set(references.size, value);
						} else if (subMode === SUB_MODE_SYMBOL) {
							value = Symbol.for(value);
						} else if (subMode === SUB_MODE_URL) {
							value = new URL(value);
							references.set(references.size, value);
						} else if (subMode === SUB_MODE_ARRAY_BUFFER) {
							value = decodeTypedArray(value).buffer;
							references.set(references.size, value);
						} else if (subMode === SUB_MODE_INT_8_ARRAY) {
							value = new Int8Array(decodeTypedArray(value).buffer);
							references.set(references.size, value);
						} else if (subMode === SUB_MODE_UINT_8_ARRAY) {
							value = decodeTypedArray(value);
							references.set(references.size, value);
						} else if (subMode === SUB_MODE_UINT_8_ARRAY_CLAMPED) {
							value = new Uint8ClampedArray(decodeTypedArray(value).buffer);
							references.set(references.size, value);
						} else if (subMode === SUB_MODE_INT_16_ARRAY) {
							value = new Int16Array(decodeTypedArray(value).buffer);
							references.set(references.size, value);
						} else if (subMode === SUB_MODE_UINT_16_ARRAY) {
							value = new Uint16Array(decodeTypedArray(value).buffer);
							references.set(references.size, value);
						} else if (subMode === SUB_MODE_INT_32_ARRAY) {
							value = new Int32Array(decodeTypedArray(value).buffer);
							references.set(references.size, value);
						} else if (subMode === SUB_MODE_UINT_32_ARRAY) {
							value = new Uint32Array(decodeTypedArray(value).buffer);
							references.set(references.size, value);
						} else if (subMode === SUB_MODE_FLOAT_32_ARRAY) {
							value = new Float32Array(decodeTypedArray(value).buffer);
							references.set(references.size, value);
						} else if (subMode === SUB_MODE_FLOAT_64_ARRAY) {
							value = new Float64Array(decodeTypedArray(value).buffer);
							references.set(references.size, value);
						} else if (subMode === SUB_MODE_BIG_INT_64_ARRAY) {
							value = new BigInt64Array(decodeTypedArray(value).buffer);
							references.set(references.size, value);
						} else if (subMode === SUB_MODE_BIG_UINT_64_ARRAY) {
							value = new BigUint64Array(decodeTypedArray(value).buffer);
							references.set(references.size, value);
						} else if (subMode === SUB_MODE_DATA_VIEW) {
							value = decodeTypedArray(value);
							value = new DataView(
								(value as Uint8Array).buffer,
								(value as Uint8Array).byteOffset,
								(value as Uint8Array).byteLength,
							);
							references.set(references.size, value);
						}

						releaseValue(value, 0);
					}
					mode = MODE_UNKNOWN;
					subMode = SUB_MODE_UNKNOWN;
				} else {
					i--;
				}
			}
		}
		if (i > length) {
			shouldSkip = i - length;
		}
	};

	let reader = stream.getReader();
	(async () => {
		let read: ReadableStreamReadResult<string>;
		while (!(read = await reader.read()).done) {
			step(read.value);
		}
	})()
		.catch((error) => {
			if (root) {
				root.reject(error);
				root = null;
			}
			for (let deferred of deferredValues.values()) {
				deferred.reject(error);
			}
		})
		.finally(() => {
			reader.releaseLock();

			if (root) {
				root.reject(new Error("Stream ended before root value was parsed"));
				root = null;
			}
			for (let deferred of deferredValues.values()) {
				deferred.reject(new Error("Stream ended before promise was resolved"));
			}
		});

	return root.promise;
}

function decodeTypedArray(base64: string) {
	const decodedStr = atob(base64);
	const uint8Array = new Uint8Array(decodedStr.length);
	for (let i = 0; i < decodedStr.length; i++) {
		uint8Array[i] = decodedStr.charCodeAt(i);
	}
	return uint8Array;
}
