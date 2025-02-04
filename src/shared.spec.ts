import { describe, test } from "node:test";
import { expect } from "expect";

import {
	Deferred,
	DeferredAsyncIterable,
	TurboBlob,
	TurboFile,
	WaitGroup,
} from "./shared.js";

describe("WaitGroup", () => {
	test("basic", async () => {
		const wg = new WaitGroup();
		const done = wg.wait();

		wg.add();
		setTimeout(() => wg.done(), 0);
		wg.add();
		setTimeout(() => wg.done(), 0);

		await done;
	});

	test("wait before done", async () => {
		const wg = new WaitGroup();
		const doneNone = wg.wait();

		wg.add();
		const doneOne = wg.wait();

		await doneNone;
		setTimeout(() => wg.done(), 0);

		await doneOne;
	});

	test("double wait after done", async () => {
		const wg = new WaitGroup();
		wg.add();
		setTimeout(() => wg.done(), 0);

		setTimeout(() => wg.add(), 0);
		await wg.wait();
		setTimeout(() => wg.done(), 0);

		await wg.wait();
		await wg.wait();
	});
});

describe("Deferred", () => {
	test("basic", async () => {
		const deferred = new Deferred<number>();
		deferred.resolve(42);
		expect(await deferred.promise).toBe(42);
	});

	test("reject", async () => {
		const deferred = new Deferred<number>();
		deferred.reject(new Error("foo"));
		await expect(deferred.promise).rejects.toThrow("foo");
	});
});

describe("DeferredAsyncIterable", () => {
	test("basic", async () => {
		const deferred = new DeferredAsyncIterable<number>();
		setTimeout(() => deferred.yield(1), 0);
		for await (const value of deferred.iterable) {
			expect(value).toBe(1);
			break;
		}
		setTimeout(() => deferred.yield(2), 0);
		for await (const value of deferred.iterable) {
			expect(value).toBe(2);
			break;
		}
		setTimeout(() => deferred.yield(3), 0);
		for await (const value of deferred.iterable) {
			expect(value).toBe(3);
			break;
		}
		setTimeout(() => deferred.resolve(), 0);
		for await (const _ of deferred.iterable) {
			throw new Error("should not reach here");
		}
	});
});

test("TurboBlob", async () => {
	const blob = new TurboBlob();
	blob.promise = Promise.resolve(
		new TextEncoder().encode("Hello, world!").buffer,
	);
	blob.size = 13;
	blob.type = "text/plain";

	expect(await blob.bytes()).toEqual(
		new Uint8Array([
			72, 101, 108, 108, 111, 44, 32, 119, 111, 114, 108, 100, 33,
		]),
	);

	expect(await blob.text()).toBe("Hello, world!");

	expect(await blob.slice(0, 5).text()).toBe("Hello");

	expect(await blob.slice(0, 5).slice(1, 3).text()).toBe("el");

	expect(await blob.slice(0, 5).slice(1, 3).slice(1).text()).toBe("l");
});

test("TurboFile", async () => {
	const blob = new TurboFile();
	blob.promise = Promise.resolve(
		new TextEncoder().encode("Hello, world!").buffer,
	);
	blob.size = 13;
	blob.type = "text/plain";
	blob.name = "file.txt";
	blob.lastModified = 1000;

	expect(await blob.bytes()).toEqual(
		new Uint8Array([
			72, 101, 108, 108, 111, 44, 32, 119, 111, 114, 108, 100, 33,
		]),
	);

	expect(await blob.text()).toBe("Hello, world!");

	expect(await blob.slice(0, 5).text()).toBe("Hello");

	expect(await blob.slice(0, 5).slice(1, 3).text()).toBe("el");

	expect(await blob.slice(0, 5).slice(1, 3).slice(1).text()).toBe("l");
});
