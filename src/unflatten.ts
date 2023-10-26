import {
  Deferred,
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
  type ThisDecode,
  TYPE_ERROR,
  TYPE_NULL_OBJECT,
} from "./utils.js";

const globalObj = (
  typeof window !== "undefined"
    ? window
    : typeof globalThis !== "undefined"
    ? globalThis
    : undefined
) as Record<string, typeof Error> | undefined;

export function unflatten(this: ThisDecode, parsed: unknown): unknown {
  if (typeof parsed === "number") return hydrate.call(this, parsed);

  if (!Array.isArray(parsed) || !parsed.length) throw new SyntaxError();

  const startIndex = this.values.length;
  this.values.push(...parsed);
  this.hydrated.length = this.values.length;

  return hydrate.call(this, startIndex);
}

function hydrate(this: ThisDecode, index: number) {
  const { hydrated, values, deferred } = this;

  switch (index) {
    case UNDEFINED:
      return;
    case NAN:
      return NaN;
    case POSITIVE_INFINITY:
      return Infinity;
    case NEGATIVE_INFINITY:
      return -Infinity;
    case NEGATIVE_ZERO:
      return -0;
  }

  if (hydrated[index]) return hydrated[index];

  const value = values[index];
  if (!value || typeof value !== "object") return (hydrated[index] = value);

  if (Array.isArray(value)) {
    if (typeof value[0] === "string") {
      switch (value[0]) {
        case TYPE_DATE:
          return (hydrated[index] = new Date(value[1]));
        case TYPE_BIGINT:
          return (hydrated[index] = BigInt(value[1]));
        case TYPE_REGEXP:
          return (hydrated[index] = new RegExp(value[1], value[2]));
        case TYPE_SYMBOL:
          return (hydrated[index] = Symbol.for(value[1]));
        case TYPE_SET:
          const set = new Set();
          hydrated[index] = set;
          for (let i = 1; i < value.length; i++)
            set.add(hydrate.call(this, value[i]));
          return set;
        case TYPE_MAP:
          const map = new Map();
          hydrated[index] = map;
          for (let i = 1; i < value.length; i += 2) {
            map.set(
              hydrate.call(this, value[i]),
              hydrate.call(this, value[i + 1])
            );
          }
          return map;
        case TYPE_NULL_OBJECT:
          console.log({ value });
          const obj = Object.create(null);
          hydrated[index] = obj;
          for (const key in value[1])
            obj[key] = hydrate.call(this, value[1][key]);
          return obj;
        case TYPE_PROMISE:
          if (hydrated[value[1]]) {
            return (hydrated[index] = hydrated[value[1]]);
          } else {
            const d = new Deferred();
            deferred[value[1]] = d;
            return (hydrated[index] = d.promise);
          }
        case TYPE_ERROR:
          const [, message, errorType] = value;
          let error =
            errorType && globalObj && globalObj[errorType]
              ? new globalObj[errorType](message)
              : new Error(message);
          hydrated[index] = error;
          return error;
        default:
          throw new SyntaxError();
      }
    } else {
      const array: unknown[] = [];
      hydrated[index] = array;

      for (let i = 0; i < value.length; i++) {
        const n = value[i];
        if (n !== HOLE) array[i] = hydrate.call(this, n);
      }
      return array;
    }
  } else {
    const object: Record<string, unknown> = {};
    hydrated[index] = object;

    for (const key in value)
      object[key] = hydrate.call(this, (value as Record<string, number>)[key]);
    return object;
  }
}
