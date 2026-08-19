import { bench, do_not_optimize, group, run } from "mitata";

const random = Math.random;

const keyPool = Array.from({ length: 40 }, (_, i) => `key_${i}`);

function randomValue(): unknown {
	const r = random();
	if (r < 0.2) return null;
	if (r < 0.35) return Math.floor(random() * 100000);
	if (r < 0.5) return random();
	if (r < 0.65) return `string-value-${Math.floor(random() * 100000)}`;
	if (r < 0.75) return random() < 0.5;
	if (r < 0.85) return [1, 2, 3];
	return { inner: Math.floor(random() * 100), list: [1, 2, 3] };
}

function makeObject(): ReadonlyArray<[string, unknown]> {
	const count = 4 + Math.floor(random() * 13);
	const pairs: Array<[string, unknown]> = [];
	for (let i = 0; i < count; i++) {
		pairs.push([
			keyPool[(i * 7 + Math.floor(random() * 3)) % keyPool.length],
			randomValue(),
		]);
	}
	return pairs;
}

const objects = Array.from({ length: 5000 }, makeObject);

group("releaseValue object assignment", () => {
	bench("plain index assignment", () => {
		let count = 0;
		for (const pairs of objects) {
			const target: Record<string, unknown> = {};
			for (const [key, value] of pairs) {
				target[key] = value;
				count++;
			}
			do_not_optimize(target);
		}
		do_not_optimize(count);
	});

	bench("defineProperty for all keys", () => {
		let count = 0;
		for (const pairs of objects) {
			const target: Record<string, unknown> = {};
			for (const [key, value] of pairs) {
				Object.defineProperty(target, key, {
					value,
					writable: true,
					enumerable: true,
					configurable: true,
				});
				count++;
			}
			do_not_optimize(target);
		}
		do_not_optimize(count);
	});

	bench("defineProperty only for __proto__", () => {
		let count = 0;
		for (const pairs of objects) {
			const target: Record<string, unknown> = {};
			for (const [key, value] of pairs) {
				if (key === "__proto__") {
					Object.defineProperty(target, key, {
						value,
						writable: true,
						enumerable: true,
						configurable: true,
					});
				} else {
					target[key] = value;
				}
				count++;
			}
			do_not_optimize(target);
		}
		do_not_optimize(count);
	});
});

await run();