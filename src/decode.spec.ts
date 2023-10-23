import { test } from "node:test";
import { expect } from "expect";

import { unflatten, type ThisDecode } from "./decode.js";
import { flatten, type ThisEncode } from "./encode.js";

function quickEncode(value: unknown) {
  const encoder: ThisEncode = {
    index: 0,
    indicies: new Map(),
    stringified: [],
    deferred: [],
  };

  const id = flatten.call(encoder, value);
  const encoded =
    id < 0 ? String(id) : "[" + encoder.stringified.join(",") + "]";

  return JSON.parse(encoded);
}

function quickDecode(value: unknown) {
  const decoder: ThisDecode = {
    hydrated: [],
    values: [],
    deferred: {},
  };

  return unflatten.call(decoder, value);
}

test("should encode and decode undefined", () => {
  const input = undefined;
  const output = quickDecode(quickEncode(input));
  expect(output).toEqual(input);
});

test("should encode and decode null", () => {
  const input = null;
  const output = quickDecode(quickEncode(input));
  expect(output).toEqual(input);
});

test("should encode and decode boolean", () => {
  const input = true;
  const output = quickDecode(quickEncode(input));
  expect(output).toEqual(input);

  const input2 = false;
  const output2 = quickDecode(quickEncode(input2));
  expect(output2).toEqual(input2);
});

test("should encode and decode number", () => {
  const input = 42;
  const output = quickDecode(quickEncode(input));
  expect(output).toEqual(input);
});

test("should encode and decode string", () => {
  const input = "Hello World";
  const output = quickDecode(quickEncode(input));
  expect(output).toEqual(input);
});

test("should encode and decode array", () => {
  const input = [1, 2, 3];
  const output = quickDecode(quickEncode(input));
  expect(output).toEqual(input);
});

test("should encode and decode array with holes", () => {
  const input = [1, , 3];
  const output = quickDecode(quickEncode(input));
  expect(output).toEqual(input);
});

test("should encode and decode object", () => {
  const input = { foo: "bar" };
  const output = quickDecode(quickEncode(input));
  expect(output).toEqual(input);
});

test("should encode and decode object with undefined", () => {
  const input = { foo: undefined };
  const output = quickDecode(quickEncode(input)) as typeof input;
  expect(output).toEqual(input);
  expect("foo" in output).toBe(true);
});

test("should encode and decode a symbol", () => {
  const input = Symbol.for("foo");
  const output = quickDecode(quickEncode(input));
  expect(output).toEqual(input);
});

test("should encode and decode a bigint", () => {
  const input = BigInt(42);
  const output = quickDecode(quickEncode(input));
  expect(output).toEqual(input);
});

test("should encode and decode a date", () => {
  const input = new Date(42);
  const output = quickDecode(quickEncode(input));
  expect(output).toEqual(input);
});

test("should encode and decode a regexp", () => {
  const input = /foo/g;
  const output = quickDecode(quickEncode(input));
  expect(output).toEqual(input);
});

test("should encode and decode a set", () => {
  const input = new Set([1, 2, 3]);
  const output = quickDecode(quickEncode(input));
  expect(output).toEqual(input);
});

test("should encode and decode a map", () => {
  const input = new Map([
    [1, 2],
    [3, 4],
  ]);
  const output = quickDecode(quickEncode(input));
  expect(output).toEqual(input);
});
