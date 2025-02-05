"use server";

import { Counter } from "~/components/counter";
import { Form } from "~/components/form";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";

let name = "World";

export async function sayHello(formData: FormData) {
	name = String(formData.get("name")).trim() || "World";
}

export async function App({ url }: { url: URL }) {
	return (
		<main className="container mx-auto px-4 py-8 prose lg:prose-xl">
			<title>Vite + Preact</title>
			<h1>Hello, Server!</h1>
			<p>This is an example of PSC (Preact Server Components)</p>

			<Counter />

			<ul>
				<li>
					<a href="/">Home</a>
				</li>
				<li>
					<a href="/about">About</a>
				</li>
			</ul>

			<p>{url.pathname}</p>

			<Counter key={url.pathname} />

			<Form action={sayHello}>
				<p>Hello, {name}</p>
				<Label htmlFor="name">Name</Label>
				<Input id="name" name="name" type="text" />
				<Button type="submit">Submit</Button>
			</Form>
		</main>
	);
}
