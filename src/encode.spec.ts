import { test } from "node:test";
import { expect } from "expect";

import {
  HOLE,
  NAN,
  NEGATIVE_INFINITY,
  NEGATIVE_ZERO,
  POSITIVE_INFINITY,
  UNDEFINED,
  TYPE_BIGINT,
  TYPE_DATE,
  TYPE_MAP,
  TYPE_REGEXP,
  TYPE_SET,
  TYPE_SYMBOL,
  TYPE_PROMISE,
} from "./constants.js";
import { flatten, ThisEncode } from "./encode.js";

function quickEncode(value: unknown) {
  const encoder: ThisEncode = {
    index: 0,
    indicies: new Map(),
    stringified: [],
    deferred: [],
  };

  return {
    id: flatten.call(encoder, value),
    encoder,
  };
}

test("should flatten undfined", () => {
  const { id, encoder } = quickEncode(undefined);
  expect(id).toEqual(UNDEFINED);
  expect(encoder.stringified).toEqual([]);
});

test("should flatten null", () => {
  const { id, encoder } = quickEncode(null);
  expect(id).toEqual(0);
  expect(encoder.stringified).toEqual(["null"]);
});

test("should flatten boolean", () => {
  const { id, encoder } = quickEncode(true);
  expect(id).toEqual(0);
  expect(encoder.stringified).toEqual(["true"]);

  const { id: id2, encoder: encoder2 } = quickEncode(false);
  expect(id2).toEqual(0);
  expect(encoder2.stringified).toEqual(["false"]);
});

test("should flatten number", () => {
  const { id, encoder } = quickEncode(42);
  expect(id).toEqual(0);
  expect(encoder.stringified).toEqual(["42"]);
});

test("should flatten NaN", () => {
  const { id, encoder } = quickEncode(NaN);
  expect(id).toEqual(NAN);
  expect(encoder.stringified).toEqual([]);
});

test("should flatten Infinity", () => {
  const { id, encoder } = quickEncode(Infinity);
  expect(id).toEqual(POSITIVE_INFINITY);
  expect(encoder.stringified).toEqual([]);
});

test("should flatten -Infinity", () => {
  const { id, encoder } = quickEncode(-Infinity);
  expect(id).toEqual(NEGATIVE_INFINITY);
  expect(encoder.stringified).toEqual([]);
});

test("should flatten -0", () => {
  const { id, encoder } = quickEncode(-0);
  expect(id).toEqual(NEGATIVE_ZERO);
  expect(encoder.stringified).toEqual([]);
});

test("should flatten string", () => {
  const { id, encoder } = quickEncode("Hello World");
  expect(id).toEqual(0);
  expect(encoder.stringified).toEqual(['"Hello World"']);
});

test("should flatten bigint", () => {
  const { id, encoder } = quickEncode(BigInt(42));
  expect(id).toEqual(0);
  expect(encoder.stringified).toEqual([`["${TYPE_BIGINT}","42"]`]);
});

test("should flatten symbol", () => {
  const { id, encoder } = quickEncode(Symbol.for("foo"));
  expect(id).toEqual(0);
  expect(encoder.stringified).toEqual([`["${TYPE_SYMBOL}","foo"]`]);
});

test("should flatten date", () => {
  const { id, encoder } = quickEncode(new Date(42));
  expect(id).toEqual(0);
  expect(encoder.stringified).toEqual([`["${TYPE_DATE}",42]`]);
});

test("should flatten regexp", () => {
  const { id, encoder } = quickEncode(/foo/g);
  expect(id).toEqual(0);
  expect(encoder.stringified).toEqual([`["${TYPE_REGEXP}","foo","g"]`]);
});

test("should flatten array", () => {
  const { id, encoder } = quickEncode(["a", "b", "c", undefined]);
  expect(id).toEqual(0);
  console.log(encoder.stringified);
  expect(encoder.stringified).toEqual(["[1,2,3,-1]", '"a"', '"b"', '"c"']);
});

test("should flatten array with holes", () => {
  const { id, encoder } = quickEncode(["a", , "c"]);
  expect(id).toEqual(0);
  expect(encoder.stringified).toEqual([`[1,${HOLE},2]`, '"a"', '"c"']);
});

test("should dedupe array", () => {
  const { id, encoder } = quickEncode(["a", "b", "c", "a", "b", "c"]);
  expect(id).toEqual(0);
  expect(encoder.stringified).toEqual(["[1,2,3,1,2,3]", '"a"', '"b"', '"c"']);
});

test("should flatten self referencing array", () => {
  const input: any = ["a", "b", "c"];
  input.push(input);
  const { id, encoder } = quickEncode(input);
  expect(id).toEqual(0);
  expect(encoder.stringified).toEqual(["[1,2,3,0]", '"a"', '"b"', '"c"']);
});

test("should flatten object", () => {
  const { id, encoder } = quickEncode({ foo: "bar" });
  expect(id).toEqual(0);
  expect(encoder.stringified).toEqual(['{"foo":1}', '"bar"']);
});

test("should flatten object with undefined", () => {
  const { id, encoder } = quickEncode({ foo: undefined });
  expect(id).toEqual(0);
  expect(encoder.stringified).toEqual(['{"foo":-1}']);
});

test("should flatten self referencing object", () => {
  const input: any = { foo: "bar" };
  input.a = input;
  const { id, encoder } = quickEncode(input);
  expect(id).toEqual(0);
  expect(encoder.stringified).toEqual(['{"foo":1,"a":0}', '"bar"']);
});

test("should flatten set", () => {
  const { id, encoder } = quickEncode(new Set(["a", "b"]));
  expect(id).toEqual(0);
  expect(encoder.stringified).toEqual([`["${TYPE_SET}",1,2]`, '"a"', '"b"']);
});

test("should flatten map", () => {
  const { id, encoder } = quickEncode(
    new Map([
      ["a", "b"],
      ["b", "a"],
    ])
  );
  expect(id).toEqual(0);
  expect(encoder.stringified).toEqual([
    `["${TYPE_MAP}",1,2,2,1]`,
    '"a"',
    '"b"',
  ]);
});

test("should flatten promise", async () => {
  const { id, encoder } = quickEncode(Promise.resolve("foo"));
  expect(id).toEqual(0);
  expect(encoder.stringified).toEqual([`["${TYPE_PROMISE}",0]`]);
  expect(encoder.deferred).toHaveLength(1);
  expect(encoder.deferred[0][0]).toEqual(0);
  expect(encoder.deferred[0][1]).toBeInstanceOf(Promise);
  expect(await encoder.deferred[0][1]).toEqual("foo");
});
