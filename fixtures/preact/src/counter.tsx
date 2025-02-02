"use client";

import { useState } from "preact/hooks";

export function Counter() {
	const [count, setCount] = useState(0);
	return (
		<div>
			<button type="button" onClick={() => setCount((c) => c + 1)}>
				Increment
			</button>
			<p>Count: {count}</p>
		</div>
	);
}
