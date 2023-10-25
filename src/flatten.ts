import {
  HOLE,
  NAN,
  NEGATIVE_INFINITY,
  NEGATIVE_ZERO,
  POSITIVE_INFINITY,
  TYPE_BIGINT,
  TYPE_DATE,
  TYPE_MAP,
  TYPE_PROMISE,
  TYPE_REGEXP,
  TYPE_SET,
  TYPE_SYMBOL,
  UNDEFINED,
  type ThisEncode,
} from "./utils.js";

export function flatten(this: ThisEncode, input: unknown): number {
  if (this.indicies.has(input)) {
    return this.indicies.get(input)!;
  }

  if (input === undefined) return UNDEFINED;
  if (Number.isNaN(input)) return NAN;
  if (input === Infinity) return POSITIVE_INFINITY;
  if (input === -Infinity) return NEGATIVE_INFINITY;
  if (input === 0 && 1 / input < 0) return NEGATIVE_ZERO;

  const index = this.index++;
  this.indicies.set(input, index);
  stringify.call(this, input, index);

  return index;
}

function stringify(this: ThisEncode, input: unknown, index: number) {
  switch (typeof input) {
    case "boolean":
    case "number":
    case "string":
      this.stringified[index] = JSON.stringify(input);
      break;
    case "bigint":
      this.stringified[index] = `["${TYPE_BIGINT}","${input}"]`;
      break;
    case "symbol":
      const keyFor = Symbol.keyFor(input);
      if (!keyFor)
        throw new Error(
          "Cannot encode symbol unless created with Symbol.for()"
        );
      this.stringified[index] = `["${TYPE_SYMBOL}",${JSON.stringify(keyFor)}]`;
      break;
    case "object":
      if (!input) {
        this.stringified[index] = "null";
        break;
      }

      if (Array.isArray(input)) {
        let result = "[";
        for (let i = 0; i < input.length; i++) {
          if (i > 0) result += ",";
          if (i in input) {
            result += flatten.call(this, input[i]);
          } else {
            result += HOLE;
          }
        }
        this.stringified[index] = result + "]";
        break;
      }

      if (input instanceof Date) {
        this.stringified[index] = `["${TYPE_DATE}",${input.getTime()}]`;
        break;
      }

      if (input instanceof RegExp) {
        this.stringified[index] = `["${TYPE_REGEXP}",${JSON.stringify(
          input.source
        )},${JSON.stringify(input.flags)}]`;
        break;
      }

      if (input instanceof Set) {
        let result = `["${TYPE_SET}"`;
        for (const value of input) {
          result += "," + flatten.call(this, value);
        }
        this.stringified[index] = result + "]";
        break;
      }

      if (input instanceof Map) {
        let result = `["${TYPE_MAP}"`;
        for (const [key, value] of input) {
          result += "," + flatten.call(this, key);
          result += "," + flatten.call(this, value);
        }
        this.stringified[index] = result + "]";
        break;
      }

      if (input instanceof Promise) {
        this.stringified[index] = `["${TYPE_PROMISE}",${index}]`;
        this.deferred[index] = input;
        break;
      }

      if (!isPlainObject(input)) {
        throw new Error("Cannot encode object with prototype");
      }

      let result = "{";
      let sep = false;
      for (const key in input) {
        if (sep) result += ",";
        sep = true;
        result += JSON.stringify(key) + ":" + flatten.call(this, input[key]);
      }
      this.stringified[index] = result + "}";
      break;
    case "function":
      throw new Error("Cannot encode function");
    case "undefined":
      throw new Error("This should never happen");
  }
}

const objectProtoNames = Object.getOwnPropertyNames(Object.prototype)
  .sort()
  .join("\0");

function isPlainObject(
  thing: unknown
): thing is Record<string | number | symbol, unknown> {
  const proto = Object.getPrototypeOf(thing);

  return (
    proto === Object.prototype ||
    proto === null ||
    Object.getOwnPropertyNames(proto).sort().join("\0") === objectProtoNames
  );
}
