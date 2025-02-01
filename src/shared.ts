export const STR_ARRAY_BUFFER = "A";
export const STR_ASYNC_ITERABLE = "*";
export const STR_BIG_INT_64_ARRAY = "J";
export const STR_BIG_UINT_64_ARRAY = "j";
export const STR_BIGINT = "b";
export const STR_BLOB = "K";
export const STR_DATA_VIEW = "V";
export const STR_DATE = "D";
export const STR_ERROR = "E";
export const STR_FAILURE = "!";
export const STR_FALSE = "false";
export const STR_FILE = "k";
export const STR_FLOAT_32_ARRAY = "H";
export const STR_FLOAT_64_ARRAY = "h";
export const STR_FORM_DATA = "F";
export const STR_INFINITY = "I";
export const STR_INT_16_ARRAY = "L";
export const STR_INT_32_ARRAY = "G";
export const STR_INT_8_ARRAY = "O";
export const STR_MAP = "M";
export const STR_NaN = "NaN";
export const STR_NEGATIVE_INFINITY = "i";
export const STR_NEGATIVE_ZERO = "z";
export const STR_NULL = "null";
export const STR_PLUGIN = "P";
export const STR_PROMISE = "$";
export const STR_READABLE_STREAM = "R";
export const STR_REDACTED = "<redacted>";
export const STR_REFERENCE_SYMBOL = "@";
export const STR_REGEXP = "r";
export const STR_SET = "S";
export const STR_SUCCESS = ":";
export const STR_SYMBOL = "s";
export const STR_TRUE = "true";
export const STR_UINT_16_ARRAY = "l";
export const STR_UINT_32_ARRAY = "g";
export const STR_UINT_8_ARRAY = "o";
export const STR_UINT_8_ARRAY_CLAMPED = "C";
export const STR_UNDEFINED = "undefined";
export const STR_URL = "U";

let SUPPORTS_FILE = true;
try {
	new File([], "");
} catch {
	SUPPORTS_FILE = false;
}

export { SUPPORTS_FILE };

export class WaitGroup {
	p = 0;
	#q: (() => void)[] = [];

	#waitQueue(resolve: () => void) {
		if (this.p === 0) {
			resolve();
		} else {
			this.#q.push(resolve);
		}
	}

	add() {
		this.p++;
	}

	done() {
		if (--this.p === 0) {
			let r: (() => void) | undefined;
			while ((r = this.#q.shift()) !== undefined) {
				r();
			}
		}
	}

	wait() {
		return new Promise<void>(this.#waitQueue.bind(this));
	}
}

export class Deferred<T> {
	promise: Promise<T>;
	resolve!: (value: T) => void;
	reject!: (error: unknown) => void;

	constructor() {
		this.promise = new Promise<T>((resolve, reject) => {
			this.resolve = resolve;
			this.reject = reject;
		});
	}
}

type AsyncIterableResult<T> =
	| {
			done: false;
			value: T;
			next: Deferred<AsyncIterableResult<T>>;
	  }
	| {
			done: true;
	  };

export class DeferredAsyncIterable<T> {
	iterable: AsyncIterable<T>;
	#deferred: Deferred<AsyncIterableResult<T>> = new Deferred();
	#next = this.#deferred;

	constructor() {
		this.iterable = async function* (this: DeferredAsyncIterable<T>) {
			let next = this.#deferred;
			while (true) {
				const res = await next.promise;
				if (res.done) {
					return;
				}
				yield res.value;
				next = res.next;
			}
		}.bind(this)();
	}

	resolve() {
		this.#next.resolve({ done: true });
	}

	reject(error: unknown) {
		// We reject before there is a chance to consume the error, so we need to catch it
		// to avoid an unhandled rejection.
		this.#next.promise.catch(() => {});
		this.#next.reject(error);
	}

	yield(value: T) {
		const deferred = new Deferred<AsyncIterableResult<T>>();
		this.#next.resolve({
			done: false,
			value,
			next: deferred,
		});
		this.#next = deferred;
	}
}

export class DeferredReadableStream<T> extends DeferredAsyncIterable<T> {
	readable = new ReadableStream<T>({
		start: async (controller) => {
			try {
				for await (const value of this.iterable) {
					controller.enqueue(value);
				}
				controller.close();
			} catch (error) {
				controller.error(error);
			}
		},
	});
}

export class TurboBlob extends Blob {
	promise?: Promise<ArrayBuffer>;
	#size?: number;
	#type?: string;
	#slice: { start?: number; end?: number } = {};

	constructor();
	constructor(
		from: TurboBlob,
		start: number | undefined,
		end: number | undefined,
		contentType: string | undefined,
	);
	constructor(
		from?: TurboBlob,
		start?: number,
		end?: number,
		contentType?: string,
	) {
		super();
		if (typeof from !== "undefined") {
			this.promise = from.promise;
			let nextStart = from.#slice.start ?? 0;
			if (typeof start !== "undefined") {
				nextStart += start;
			}
			this.#slice.start = nextStart;
			let nextEnd = from.#slice.end;
			if (typeof end !== "undefined") {
				nextEnd = (from.#slice.start ?? 0) + end;
			}
			this.#slice.end = nextEnd;
			this.#type = contentType ?? from?.type;
			this.#size = (nextEnd ?? from.size) - nextStart;
		}
	}

	override get size(): number {
		if (typeof this.#size === "undefined") {
			throw new Error("Size is not set");
		}
		return this.#size;
	}
	override set size(value: number) {
		this.#size = value;
	}

	override get type(): string {
		if (typeof this.#type === "undefined") {
			throw new Error("Type is not set");
		}
		return this.#type;
	}
	override set type(value: string) {
		this.#type = value;
	}

	override async arrayBuffer(): Promise<ArrayBuffer> {
		if (!this.promise) {
			throw new Error("Promise is not set");
		}
		const buffer = await this.promise;
		if (this.#slice) {
			return buffer.slice(
				this.#slice.start as number,
				this.#slice.end as number,
			);
		}
		return buffer;
	}

	bytes(): Promise<Uint8Array> {
		return this.arrayBuffer().then((buffer) => new Uint8Array(buffer));
	}

	override slice(start?: number, end?: number, contentType?: string): Blob {
		return new TurboBlob(this, start, end, contentType);
	}

	override stream(): ReadableStream<Uint8Array> {
		return new ReadableStream({
			start: async (controller) => {
				try {
					controller.enqueue(await this.bytes());
					controller.close();
				} catch (err) {
					controller.error(err);
				}
			},
		});
	}

	override text(): Promise<string> {
		return this.bytes().then((bytes) => {
			return new TextDecoder().decode(bytes);
		});
	}
}

const FileBaseClass = SUPPORTS_FILE ? File : Blob;

export class TurboFile extends FileBaseClass {
	promise?: Promise<ArrayBuffer>;
	#size?: number;
	#type?: string;
	#name?: string;
	#lastModified?: number;
	#slice: { start?: number; end?: number } = {};

	constructor();
	constructor(
		from: TurboFile,
		start: number | undefined,
		end: number | undefined,
		contentType: string | undefined,
	);
	constructor(
		from?: TurboFile,
		start?: number,
		end?: number,
		contentType?: string,
	) {
		if (SUPPORTS_FILE) {
			super([], "");
		} else {
			super([]);
		}
		if (typeof from !== "undefined") {
			this.promise = from.promise;
			let nextStart = from.#slice.start ?? 0;
			if (typeof start !== "undefined") {
				nextStart += start;
			}
			this.#slice.start = nextStart;
			let nextEnd = from.#slice.end;
			if (typeof end !== "undefined") {
				nextEnd = (from.#slice.start ?? 0) + end;
			}
			this.#slice.end = nextEnd;
			this.#type = contentType ?? from?.type;
			this.#name = from.name;
			this.#lastModified = from.lastModified;
		}
	}

	get name(): string {
		if (typeof this.#name === "undefined") {
			throw new Error("Name is not set");
		}
		return this.#name;
	}
	set name(value: string) {
		this.#name = value;
	}

	get lastModified(): number {
		if (typeof this.#lastModified === "undefined") {
			throw new Error("Last modified is not set");
		}
		return this.#lastModified;
	}
	set lastModified(value: number) {
		this.#lastModified = value;
	}

	get size(): number {
		if (typeof this.#size === "undefined") {
			throw new Error("Size is not set");
		}
		return this.#size;
	}
	set size(value: number) {
		this.#size = value;
	}

	get type(): string {
		if (typeof this.#type === "undefined") {
			throw new Error("Type is not set");
		}
		return this.#type;
	}
	set type(value: string) {
		this.#type = value;
	}

	async arrayBuffer(): Promise<ArrayBuffer> {
		if (!this.promise) {
			throw new Error("Promise is not set");
		}
		const buffer = await this.promise;
		if (this.#slice) {
			return buffer.slice(
				this.#slice.start as number,
				this.#slice.end as number,
			);
		}
		return buffer;
	}

	bytes(): Promise<Uint8Array> {
		return this.arrayBuffer().then((buffer) => new Uint8Array(buffer));
	}

	slice(start?: number, end?: number, contentType?: string): Blob {
		return new TurboFile(this, start, end, contentType);
	}

	stream(): ReadableStream<Uint8Array> {
		return new ReadableStream({
			start: async (controller) => {
				try {
					controller.enqueue(await this.bytes());
					controller.close();
				} catch (err) {
					controller.error(err);
				}
			},
		});
	}

	text(): Promise<string> {
		return this.bytes().then((bytes) => {
			return new TextDecoder().decode(bytes);
		});
	}
}
