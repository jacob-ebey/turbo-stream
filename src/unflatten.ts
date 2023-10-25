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
} from "./utils.js";

export function unflatten(this: ThisDecode, parsed: unknown): unknown {
  if (typeof parsed === "number") return hydrate.call(this, parsed, true);

  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new Error("Invalid input");
  }

  const startIndex = this.values.length;
  this.values.push(...parsed);
  this.hydrated.length = this.values.length;

  return hydrate.call(this, startIndex);
}

function hydrate(this: ThisDecode, index: number, standalone?: true) {
  if (index === UNDEFINED) return undefined;
  if (index === NAN) return NaN;
  if (index === POSITIVE_INFINITY) return Infinity;
  if (index === NEGATIVE_INFINITY) return -Infinity;
  if (index === NEGATIVE_ZERO) return -0;

  if (standalone) throw new Error(`Invalid input`);

  if (index in this.hydrated) return this.hydrated[index];

  const value = this.values[index];
  if (!value || typeof value !== "object") {
    this.hydrated[index] = value;
  } else if (Array.isArray(value)) {
    if (typeof value[0] === "string") {
      switch (value[0]) {
        case TYPE_DATE:
          this.hydrated[index] = new Date(value[1]);
          break;
        case TYPE_BIGINT:
          this.hydrated[index] = BigInt(value[1]);
          break;
        case TYPE_REGEXP:
          this.hydrated[index] = new RegExp(value[1], value[2]);
          break;
        case TYPE_SYMBOL:
          this.hydrated[index] = Symbol.for(value[1]);
          break;
        case TYPE_SET:
          const set = new Set();
          this.hydrated[index] = set;
          for (let i = 1; i < value.length; i += 1) {
            set.add(hydrate.call(this, value[i]));
          }
          break;
        case TYPE_MAP:
          const map = new Map();
          this.hydrated[index] = map;
          for (let i = 1; i < value.length; i += 2) {
            map.set(
              hydrate.call(this, value[i]),
              hydrate.call(this, value[i + 1])
            );
          }
          break;
        case TYPE_PROMISE:
          if (this.hydrated[value[1]]) {
            this.hydrated[index] = this.hydrated[value[1]];
          } else {
            const deferred = new Deferred();
            this.deferred[value[1]] = deferred;
            this.hydrated[index] = deferred.promise;
          }
          break;
        default:
          throw new Error(`Invalid input`);
      }
    } else {
      const array = new Array(value.length);
      this.hydrated[index] = array;

      for (let i = 0; i < value.length; i += 1) {
        const n = value[i];
        if (n === HOLE) continue;

        array[i] = hydrate.call(this, n);
      }
    }
  } else {
    const object: Record<string, unknown> = {};
    this.hydrated[index] = object;

    for (const key in value) {
      const n = (value as any)[key];
      object[key] = hydrate.call(this, n);
    }
  }

  return this.hydrated[index];
}
