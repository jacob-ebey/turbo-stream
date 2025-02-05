"use client";

import { useState } from "preact/hooks";

import { Button } from "~/components/ui/button";

export function Counter() {
	const [count, setCount] = useState(0);
	return (
		<div className="flex gap-4 items-center">
			<Button type="button" onClick={() => setCount((c) => c + 1)}>
				Increment
			</Button>
			<p>Count: {count}</p>
		</div>
	);
}
