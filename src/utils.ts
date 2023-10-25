export const UNDEFINED = -1;
export const HOLE = -1;
export const NAN = -2;
export const POSITIVE_INFINITY = -3;
export const NEGATIVE_INFINITY = -4;
export const NEGATIVE_ZERO = -5;

export const TYPE_BIGINT = "B";
export const TYPE_DATE = "D";
export const TYPE_MAP = "M";
export const TYPE_SET = "S";
export const TYPE_REGEXP = "R";
export const TYPE_SYMBOL = "Y";
export const TYPE_NULL_OBJECT = "N";
export const TYPE_PROMISE = "P";

export interface ThisDecode {
  values: unknown[];
  hydrated: unknown[];
  deferred: Record<number, Deferred<unknown>>;
}

export interface ThisEncode {
  index: number;
  indicies: Map<unknown, number>;
  stringified: string[];
  deferred: Record<number, Promise<unknown>>;
}

export class Deferred<T = unknown> {
  promise: Promise<T>;
  resolve!: (value: T) => void;
  reject!: (reason: unknown) => void;

  constructor() {
    this.promise = new Promise<T>((resolve, reject) => {
      this.resolve = resolve;
      this.reject = reject;
    });
  }
}

export function createLineSplittingTransform() {
  let decoder = new TextDecoder();
  let leftover = "";

  return new TransformStream({
    transform(chunk, controller) {
      let str = decoder.decode(chunk, { stream: true });
      let parts = (leftover + str).split("\n");

      // The last part might be a partial line, so keep it for the next chunk.
      leftover = parts.pop() || "";

      for (const part of parts) {
        controller.enqueue(part);
      }
    },

    flush(controller) {
      // If there's any leftover data, enqueue it before closing.
      if (leftover) {
        controller.enqueue(leftover);
      }
    },
  });
}
