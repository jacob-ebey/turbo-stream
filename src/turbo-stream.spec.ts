import { test } from "node:test";
import { expect } from "expect";

import { decode, encode } from "./turbo-stream.js";

async function quickDecode(stream: ReadableStream<Uint8Array>) {
  const decoded = await decode(stream);
  await decoded.done;
  return decoded.value;
}

test("should encode and decode undefined", async () => {
  const input = undefined;
  const output = await quickDecode(encode(input));
  expect(output).toEqual(input);
});

test("should encode and decode null", async () => {
  const input = null;
  const output = await quickDecode(encode(input));
  expect(output).toEqual(input);
});

test("should encode and decode boolean", async () => {
  const input = true;
  const output = await quickDecode(encode(input));
  expect(output).toEqual(input);

  const input2 = false;
  const output2 = await quickDecode(encode(input2));
  expect(output2).toEqual(input2);
});

test("should encode and decode number", async () => {
  const input = 42;
  const output = await quickDecode(encode(input));
  expect(output).toEqual(input);
});

test("should encode and decode string", async () => {
  const input = "Hello World";
  const output = await quickDecode(encode(input));
  expect(output).toEqual(input);
});

test("should encode and decode Date", async () => {
  const input = new Date();
  const output = await quickDecode(encode(input));
  expect(output).toEqual(input);
});

test("should encode and decode NaN", async () => {
  const input = NaN;
  const output = await quickDecode(encode(input));
  expect(output).toEqual(input);
});

test("should encode and decode Infinity", async () => {
  const input = Infinity;
  const output = await quickDecode(encode(input));
  expect(output).toEqual(input);
});

test("should encode and decode -Infinity", async () => {
  const input = -Infinity;
  const output = await quickDecode(encode(input));
  expect(output).toEqual(input);
});

test("should encode and decode -0", async () => {
  const input = -0;
  const output = await quickDecode(encode(input));
  expect(output).toEqual(input);
});

test("should encode and decode BigInt", async () => {
  const input = BigInt(42);
  const output = await quickDecode(encode(input));
  expect(output).toEqual(input);
});

test("should encode and decode RegExp", async () => {
  const input = /foo/g;
  const output = await quickDecode(encode(input));
  expect(output).toEqual(input);
});

test("should encode and decode Symbol", async () => {
  const input = Symbol.for("foo");
  const output = await quickDecode(encode(input));
  expect(output).toEqual(input);
});

test("should encode and decode Map", async () => {
  const input = new Map([
    ["foo", "bar"],
    ["baz", "qux"],
  ]);
  const output = await quickDecode(encode(input));
  expect(output).toEqual(input);
});

test("should encode and decode Set", async () => {
  const input = new Set(["foo", "bar"]);
  const output = await quickDecode(encode(input));
  expect(output).toEqual(input);
});

test("should encode and decode an Error", async () => {
  const input = new Error("foo");
  const output = await quickDecode(encode(input));
  expect(output).toEqual(input);
});

test("should encode and decode an EvalError", async () => {
  const input = new EvalError("foo");
  const output = await quickDecode(encode(input));
  expect(output).toEqual(input);
});

test("should encode and decode array", async () => {
  const input = [1, 2, 3];
  const output = await quickDecode(encode(input));
  expect(output).toEqual(input);
});

test("should encode and decode array with holes", async () => {
  const input = [1, , 3];
  const output = await quickDecode(encode(input));
  expect(output).toEqual(input);
});

test("should encode and decode object", async () => {
  const input = { foo: "bar" };
  const output = await quickDecode(encode(input));
  expect(output).toEqual(input);
});

test("should encode and decode object with undefined", async () => {
  const input = { foo: undefined };
  const output = (await quickDecode(encode(input))) as typeof input;
  expect(output).toEqual(input);
  expect("foo" in output).toBe(true);
});

test("should encode and decode promise", async () => {
  const input = Promise.resolve("foo");
  const decoded = await decode(encode(input));
  expect(decoded.value).toBeInstanceOf(Promise);
  expect(await decoded.value).toEqual(await input);
  await decoded.done;
});

test("should encode and decode rejected promise", async () => {
  const input = Promise.reject(new Error("foo"));
  const decoded = await decode(encode(input));
  expect(decoded.value).toBeInstanceOf(Promise);
  await expect(decoded.value).rejects.toEqual(
    await input.catch((reason) => reason)
  );
  await decoded.done;
});

test("should encode and decode object with promises as values", async () => {
  const input = { foo: Promise.resolve("bar") };
  const decoded = await decode(encode(input));
  const value = decoded.value as typeof input;
  expect(value).toEqual({ foo: expect.any(Promise) });
  expect(await value.foo).toEqual(await input.foo);
  await decoded.done;
});

test("should encode and decode object with rejected promise", async () => {
  const input = { foo: Promise.reject(new Error("bar")) };
  const decoded = await decode(encode(input));
  const value = decoded.value as typeof input;
  expect(value.foo).toBeInstanceOf(Promise);
  expect(value.foo).rejects.toEqual(await input.foo.catch((reason) => reason));
  return decoded.done;
});

test("should encode and decode set with promises as values", async () => {
  const prom = Promise.resolve("foo");
  const input = new Set([prom, prom]);
  const decoded = await decode(encode(input));
  const value = decoded.value as typeof input;
  expect(value).toEqual(new Set([expect.any(Promise)]));
  const proms = Array.from(value);
  expect(await proms[0]).toEqual(await Array.from(input)[0]);
  await decoded.done;
});
