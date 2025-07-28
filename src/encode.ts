import {
	STR_ARRAY_BUFFER,
	STR_ASYNC_ITERABLE,
	STR_BIG_INT_64_ARRAY,
	STR_BIG_UINT_64_ARRAY,
	STR_BIGINT,
	STR_BLOB,
	STR_DATA_VIEW,
	STR_DATE,
	STR_ERROR,
	STR_FAILURE,
	STR_FALSE,
	STR_FILE,
	STR_FLOAT_32_ARRAY,
	STR_FLOAT_64_ARRAY,
	STR_FORM_DATA,
	STR_INFINITY,
	STR_INT_16_ARRAY,
	STR_INT_32_ARRAY,
	STR_INT_8_ARRAY,
	STR_MAP,
	STR_NaN,
	STR_NEGATIVE_INFINITY,
	STR_NEGATIVE_ZERO,
	STR_NULL,
	STR_PLUGIN,
	STR_PROMISE,
	STR_READABLE_STREAM,
	STR_REDACTED,
	STR_REFERENCE_SYMBOL,
	STR_REGEXP,
	STR_SET,
	STR_SUCCESS,
	STR_SYMBOL,
	STR_TRUE,
	STR_UINT_16_ARRAY,
	STR_UINT_32_ARRAY,
	STR_UINT_8_ARRAY,
	STR_UINT_8_ARRAY_CLAMPED,
	STR_UNDEFINED,
	STR_URL,
	SUPPORTS_FILE,
	WaitGroup,
} from "./shared.js";
let { NEGATIVE_INFINITY, POSITIVE_INFINITY, isNaN: nan } = Number;

const ASYNC_FRAME_TYPE_PROMISE = 1;
const ASYNC_FRAME_TYPE_ITERABLE = 2;

type AsyncFrame =
	| [
			type: typeof ASYNC_FRAME_TYPE_PROMISE,
			id: number,
			promise: PromiseLike<unknown>,
	  ]
	| [
			type: typeof ASYNC_FRAME_TYPE_ITERABLE,
			id: number,
			iterable: AsyncIterable<unknown>,
	  ];

export type EncodePlugin = (
	value: unknown,
) => [string, ...unknown[]] | false | null | undefined;

export type EncodeOptions = {
	plugins?: EncodePlugin[];
	redactErrors?: boolean | string;
	signal?: AbortSignal;
};

export function encode(
	value: unknown,
	{ plugins = [], redactErrors = true, signal }: EncodeOptions = {},
) {
	// Merge global plugins with provided plugins
	const allPlugins = [...plugins];
	
	// Lazy load global plugins to avoid circular dependencies
	let globalPluginsLoaded = false;
	const getGlobalPlugins = () => {
		if (!globalPluginsLoaded) {
			try {
				// Use require-like pattern for dynamic import in sync context
				const pluginRegistry = (globalThis as any).__turboStreamPluginRegistry;
				if (pluginRegistry?.getGlobalEncodePlugins) {
					allPlugins.push(...pluginRegistry.getGlobalEncodePlugins());
				}
			} catch {
				// If plugin registry is not available, continue without global plugins
			}
			globalPluginsLoaded = true;
		}
		return allPlugins;
	};

	const aborted = () => signal?.aborted ?? false;
	const waitForAbort = new Promise<never>((_, reject) => {
		signal?.addEventListener("abort", (reason) => {
			reject(new DOMException("Aborted", "AbortError"));
		});
	});
	return new ReadableStream<string>({
		async start(controller) {
			let refCache = new WeakMap();
			let asyncCache = new WeakMap();
			let counters = { refId: 0, promiseId: 0 };
			let wg = new WaitGroup();
			let chunks: string[] = [];

			let encode = (value: unknown) => {
				encodeSync(
					value,
					chunks,
					refCache,
					asyncCache,
					promises,
					counters,
					getGlobalPlugins(),
					redactErrors,
				);

				controller.enqueue(chunks.join("") + "\n");
				chunks.length = 0;
			};

			let handlePromiseResolved = (id: number, value: unknown) => {
				wg.done();

				if (aborted()) return;
				controller.enqueue(`${id}${STR_SUCCESS}`);
				encode(value);
			};

			let handlePromiseRejected = (id: number, error: unknown) => {
				wg.done();

				if (aborted()) return;
				controller.enqueue(`${id}${STR_FAILURE}`);
				encode(error);
			};

			let promises = {
				push: (...promiseFrames: AsyncFrame[]) => {
					for (let [type, id, promise] of promiseFrames) {
						wg.add();
						if (type === ASYNC_FRAME_TYPE_PROMISE) {
							(
								Promise.race([promise, waitForAbort]) as PromiseLike<unknown>
							).then(
								handlePromiseResolved.bind(null, id),
								handlePromiseRejected.bind(null, id),
							);
						} else {
							(async () => {
								let iterator = (promise as AsyncIterable<unknown>)[
									Symbol.asyncIterator
								]();

								let result: IteratorResult<unknown>;
								do {
									result = await iterator.next();

									if (aborted()) return;

									if (!result.done) {
										controller.enqueue(`${id}${STR_SUCCESS}`);
										encode(result.value);
									}
								} while (!result.done);
							})()
								.then(
									() => {
										if (aborted()) return;
										controller.enqueue(`${id}\n`);
									},
									(error) => {
										if (aborted()) return;
										controller.enqueue(`${id}${STR_FAILURE}`);
										encode(error);
									},
								)
								.finally(() => {
									wg.done();
								});
						}
					}
				},
			};

			try {
				encode(value);

				do {
					await Promise.race([wg.wait(), waitForAbort]);
				} while (wg.p > 0);

				controller.close();
			} catch (error) {
				controller.error(error);
			}
		},
	});
}

const ENCODE_FRAME_TYPE_NEEDS_ENCODING = 1;
const ENCODE_FRAME_TYPE_ALREADY_ENCODED = 2;

type EncodeFrameObj =
	| {
			type: typeof ENCODE_FRAME_TYPE_NEEDS_ENCODING;
			prefix: string;
			value: unknown;
	  }
	| {
			type: typeof ENCODE_FRAME_TYPE_ALREADY_ENCODED;
			prefix: string;
			value: undefined;
	  };

class EncodeFrame {
	public type: number;
	public prefix: string;
	public value: unknown;
	constructor(type: number, prefix: string, value: unknown) {
		this.type = type;
		this.prefix = prefix;
		this.value = value;
	}
}

export function encodeSync(
	value: unknown,
	chunks: { push(...chunk: string[]): void },
	refs: WeakMap<object, number>,
	promises: WeakMap<object, number>,
	asyncFrames: { push(frame: AsyncFrame): void },
	counters: { refId: number; promiseId: number },
	plugins: EncodePlugin[],
	redactErrors: boolean | string,
) {
	let encodeStack: EncodeFrameObj[] = [
		new EncodeFrame(
			ENCODE_FRAME_TYPE_NEEDS_ENCODING,
			"",
			value,
		) as EncodeFrameObj,
	];
	let frame: EncodeFrameObj | undefined;

	encodeLoop: while ((frame = encodeStack.pop()) !== undefined) {
		if (frame.type === ENCODE_FRAME_TYPE_ALREADY_ENCODED) {
			chunks.push(frame.prefix);
			continue;
		}

		let { prefix, value } = frame;
		chunks.push(prefix);

		if (value === undefined) {
			chunks.push(STR_UNDEFINED);
			continue;
		}
		if (value === null) {
			chunks.push(STR_NULL);
			continue;
		}
		if (value === true) {
			chunks.push(STR_TRUE);
			continue;
		}
		if (value === false) {
			chunks.push(STR_FALSE);
			continue;
		}

		const typeOfValue = typeof value;
		if (typeOfValue === "object") {
			if (
				value instanceof Promise ||
				typeof (value as PromiseLike<unknown>).then === "function"
			) {
				let existingId = promises.get(value);
				if (existingId !== undefined) {
					chunks.push(STR_PROMISE, existingId.toString());
					continue;
				}

				let promiseId = counters.promiseId++;
				promises.set(value, promiseId);
				chunks.push(STR_PROMISE, promiseId.toString());
				asyncFrames.push([
					ASYNC_FRAME_TYPE_PROMISE,
					promiseId,
					value as PromiseLike<unknown>,
				]);
				continue;
			}

			if (value instanceof ReadableStream) {
				let existingId = promises.get(value);
				if (existingId !== undefined) {
					chunks.push(STR_READABLE_STREAM, existingId.toString());
					continue;
				}

				let iterableId = counters.promiseId++;
				promises.set(value, iterableId);
				chunks.push(STR_READABLE_STREAM, iterableId.toString());
				asyncFrames.push([
					ASYNC_FRAME_TYPE_ITERABLE,
					iterableId,
					{
						[Symbol.asyncIterator]: async function* () {
							let reader = (value as ReadableStream).getReader();
							try {
								while (true) {
									let { done, value } = await reader.read();
									if (done) {
										return;
									}
									yield value;
								}
							} finally {
								reader.releaseLock();
							}
						},
					},
				]);
				continue;
			}

			if (typeof (value as any)[Symbol.asyncIterator] === "function") {
				let existingId = promises.get(value);
				if (existingId !== undefined) {
					chunks.push(STR_ASYNC_ITERABLE, existingId.toString());
					continue;
				}

				let iterableId = counters.promiseId++;
				promises.set(value, iterableId);
				chunks.push(STR_ASYNC_ITERABLE, iterableId.toString());
				asyncFrames.push([
					ASYNC_FRAME_TYPE_ITERABLE,
					iterableId,
					value as AsyncIterable<unknown>,
				]);
				continue;
			}

			{
				let existingId = refs.get(value);
				if (existingId !== undefined) {
					chunks.push(STR_REFERENCE_SYMBOL, existingId.toString());
					continue;
				}
				refs.set(value, counters.refId++);
			}

			if (value instanceof Date) {
				chunks.push(STR_DATE, '"', value.toJSON(), '"');
			} else if (value instanceof RegExp) {
				chunks.push(STR_REGEXP, JSON.stringify([value.source, value.flags]));
			} else if (value instanceof URL) {
				chunks.push(STR_URL, JSON.stringify(value));
			} else if (value instanceof ArrayBuffer) {
				chunks.push(
					STR_ARRAY_BUFFER,
					stringifyTypedArray(new Uint8Array(value)),
				);
			} else if (value instanceof Int8Array) {
				chunks.push(STR_INT_8_ARRAY, stringifyTypedArray(value));
			} else if (value instanceof Uint8Array) {
				chunks.push(STR_UINT_8_ARRAY, stringifyTypedArray(value));
			} else if (value instanceof Uint8ClampedArray) {
				chunks.push(STR_UINT_8_ARRAY_CLAMPED, stringifyTypedArray(value));
			} else if (value instanceof Int16Array) {
				chunks.push(STR_INT_16_ARRAY, stringifyTypedArray(value));
			} else if (value instanceof Uint16Array) {
				chunks.push(STR_UINT_16_ARRAY, stringifyTypedArray(value));
			} else if (value instanceof Int32Array) {
				chunks.push(STR_INT_32_ARRAY, stringifyTypedArray(value));
			} else if (value instanceof Uint32Array) {
				chunks.push(STR_UINT_32_ARRAY, stringifyTypedArray(value));
			} else if (value instanceof Float32Array) {
				chunks.push(STR_FLOAT_32_ARRAY, stringifyTypedArray(value));
			} else if (value instanceof Float64Array) {
				chunks.push(STR_FLOAT_64_ARRAY, stringifyTypedArray(value));
			} else if (value instanceof BigInt64Array) {
				chunks.push(STR_BIG_INT_64_ARRAY, stringifyTypedArray(value));
			} else if (value instanceof BigUint64Array) {
				chunks.push(STR_BIG_UINT_64_ARRAY, stringifyTypedArray(value));
			} else if (value instanceof DataView) {
				chunks.push(STR_DATA_VIEW, stringifyTypedArray(value));
			} else if (value instanceof FormData) {
				encodeStack.push(
					new EncodeFrame(
						ENCODE_FRAME_TYPE_NEEDS_ENCODING,
						STR_FORM_DATA,
						Array.from(value.entries()),
					) as EncodeFrameObj,
				);
			} else if (SUPPORTS_FILE && value instanceof File) {
				encodeStack.push(
					new EncodeFrame(ENCODE_FRAME_TYPE_NEEDS_ENCODING, STR_FILE, {
						promise: (value as File).arrayBuffer(),
						size: value.size,
						type: value.type,
						name: value.name,
						lastModified: value.lastModified,
					}) as EncodeFrameObj,
				);
			} else if (value instanceof Blob) {
				encodeStack.push(
					new EncodeFrame(ENCODE_FRAME_TYPE_NEEDS_ENCODING, STR_BLOB, {
						promise: (value as Blob).arrayBuffer(),
						size: value.size,
						type: value.type,
					}) as EncodeFrameObj,
				);
			} else if (value instanceof Error) {
				encodeStack.push(
					new EncodeFrame(
						ENCODE_FRAME_TYPE_NEEDS_ENCODING,
						STR_ERROR,
						prepareErrorForEncoding(value, redactErrors),
					) as EncodeFrameObj,
				);
			} else if (typeof (value as any).toJSON === "function") {
				const newValue = (value as any).toJSON();
				encodeStack.push(
					new EncodeFrame(
						ENCODE_FRAME_TYPE_NEEDS_ENCODING,
						"",
						newValue,
					) as EncodeFrameObj,
				);
				if (typeof newValue === "object") {
					counters.refId--;
				} else {
					refs.delete(value);
				}
			} else {
				{
					let isIterable =
						typeof (value as any)[Symbol.iterator] === "function";

					if (isIterable) {
						let isArray = Array.isArray(value);
						let toEncode = isArray
							? value
							: Array.from(value as Iterable<unknown>);

						encodeStack.push(
							new EncodeFrame(
								ENCODE_FRAME_TYPE_ALREADY_ENCODED,
								"]",
								undefined,
							) as EncodeFrameObj,
						);
						for (let i = (toEncode as unknown[]).length - 1; i >= 0; i--) {
							encodeStack.push(
								new EncodeFrame(
									ENCODE_FRAME_TYPE_NEEDS_ENCODING,
									i === 0 ? "" : ",",
									(toEncode as unknown[])[i],
								) as EncodeFrameObj,
							);
						}
						chunks.push(
							isArray
								? "["
								: value instanceof Set
									? `${STR_SET}[`
									: value instanceof Map
										? `${STR_MAP}[`
										: "[",
						);
						continue;
					}
				}

				{
					let pluginsLength = plugins.length;
					for (let i = 0; i < pluginsLength; i++) {
						let result = plugins[i](value);
						if (Array.isArray(result)) {
							encodeStack.push(
								new EncodeFrame(
									ENCODE_FRAME_TYPE_NEEDS_ENCODING,
									STR_PLUGIN,
									result,
								) as EncodeFrameObj,
							);
							counters.refId--;
							refs.delete(value);
							continue encodeLoop;
						}
					}
				}

				encodeStack.push(
					new EncodeFrame(
						ENCODE_FRAME_TYPE_ALREADY_ENCODED,
						"}",
						undefined,
					) as EncodeFrameObj,
				);
				{
					let keys = Object.keys(value as object);
					let end = keys.length;
					let encodeFrames = new Array(end);
					end -= 1;

					for (let i = keys.length - 1; i >= 0; i--) {
						let key = keys[i];
						let prefix = i > 0 ? "," : "";
						encodeFrames[end - i] = new EncodeFrame(
							ENCODE_FRAME_TYPE_NEEDS_ENCODING,
							`${prefix}${JSON.stringify(key)}:`,
							(value as any)[key],
						);
					}

					encodeStack.push(...encodeFrames);
				}
				chunks.push("{");
			}
		} else if (typeOfValue === "string") {
			chunks.push(JSON.stringify(value));
		} else if (typeOfValue === "number") {
			if (nan(value)) {
				chunks.push(STR_NaN);
			} else if (value === POSITIVE_INFINITY) {
				chunks.push(STR_INFINITY);
			} else if (value === NEGATIVE_INFINITY) {
				chunks.push(STR_NEGATIVE_INFINITY);
			} else if (Object.is(value, -0)) {
				chunks.push(STR_NEGATIVE_ZERO);
			} else {
				chunks.push(value.toString());
			}
		} else if (typeOfValue === "bigint") {
			chunks.push(STR_BIGINT, value.toString());
		} else if (typeOfValue === "symbol") {
			let symbolKey = Symbol.keyFor(value as symbol);
			if (typeof symbolKey === "string") {
				chunks.push(STR_SYMBOL, JSON.stringify(symbolKey));
			} else {
				chunks.push(STR_UNDEFINED);
			}
		} else {
			let pluginsLength = plugins.length;
			for (let i = 0; i < pluginsLength; i++) {
				let result = plugins[i](value);
				if (Array.isArray(result)) {
					encodeStack.push(
						new EncodeFrame(
							ENCODE_FRAME_TYPE_NEEDS_ENCODING,
							STR_PLUGIN,
							result,
						) as EncodeFrameObj,
					);
					continue encodeLoop;
				}
			}
			chunks.push(STR_UNDEFINED);
		}
	}
}

function prepareErrorForEncoding(error: Error, redactErrors: boolean | string) {
	const shouldRedact =
		redactErrors === true ||
		typeof redactErrors === "string" ||
		typeof redactErrors === "undefined";
	const redacted =
		typeof redactErrors === "string" ? redactErrors : STR_REDACTED;

	return {
		name: shouldRedact ? "Error" : error.name,
		message: shouldRedact ? redacted : error.message,
		stack: shouldRedact ? undefined : error.stack,
		cause: error.cause,
	};
}

function stringifyTypedArray(content: ArrayBufferView) {
	const view = new Uint8Array(
		content.buffer,
		content.byteOffset,
		content.byteLength,
	);
	return `"${btoa(String.fromCharCode.apply(String, view as unknown as number[]))}"`;
}
