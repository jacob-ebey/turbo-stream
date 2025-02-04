import { bench, boxplot, group, run, summary, do_not_optimize } from "mitata";

import { decode } from "./decode.js";
import { encode } from "./encode.js";

const thousandRandomNumbers = Array.from({ length: 1000 }, () => Math.random());

const thousandRandomStrings = Array.from({ length: 1000 }, () => {
	return Array.from({ length: 1000 }, () =>
		String.fromCharCode(Math.floor(Math.random() * 0x10000)),
	).join("");
});

const examplePayload = {
	id: 12345,
	name: "John Doe",
	email: "john.doe@example.com",
	address: {
		street: "123 Main St",
		city: "Anytown",
		state: "CA",
		zip: "12345",
	},
	phoneNumbers: [
		{
			type: "home",
			number: "555-1234",
		},
		{
			type: "work",
			number: "555-5678",
		},
	],
	interests: ["reading", "hiking", "coding"],
	friends: [
		{
			id: 1,
			name: "Jane Doe",
			email: "jane.doe@example.com",
		},
		{
			id: 2,
			name: "Bob Smith",
			email: "bob.smith@example.com",
		},
		{
			id: 3,
			name: "Alice Johnson",
			email: "alice.johnson@example.com",
		},
	],
	workExperience: [
		{
			company: "ABC Corporation",
			position: "Software Engineer",
			startDate: "2010-01-01",
			endDate: "2015-12-31",
		},
		{
			company: "DEF Startups",
			position: "CTO",
			startDate: "2016-01-01",
			endDate: "2020-12-31",
		},
	],
	education: [
		{
			school: "Anytown University",
			degree: "Bachelor of Science",
			field: "Computer Science",
			startDate: "2005-01-01",
			endDate: "2009-12-31",
		},
		{
			school: "Othertown University",
			degree: "Master of Science",
			field: "Data Science",
			startDate: "2010-01-01",
			endDate: "2012-12-31",
		},
	],
	skills: [
		{
			name: "Python",
			level: "expert",
		},
		{
			name: "Java",
			level: "intermediate",
		},
		{
			name: "C++",
			level: "beginner",
		},
	],
	projects: [
		{
			name: "Project 1",
			description: "This is a sample project",
			startDate: "2020-01-01",
			endDate: "2020-12-31",
		},
		{
			name: "Project 2",
			description: "This is another sample project",
			startDate: "2021-01-01",
			endDate: "2021-12-31",
		},
	],
	certifications: [
		{
			name: "Certification 1",
			issuer: "Issuer 1",
			issueDate: "2015-01-01",
			expirationDate: "2025-12-31",
		},
		{
			name: "Certification 2",
			issuer: "Issuer 2",
			issueDate: "2018-01-01",
			expirationDate: "2028-12-31",
		},
	],
	awards: [
		{
			name: "Award 1",
			year: 2010,
		},
		{
			name: "Award 2",
			year: 2015,
		},
	],
	publications: [
		{
			title: "Publication 1",
			authors: ["John Doe", "Jane Doe"],
			year: 2010,
		},
		{
			title: "Publication 2",
			authors: ["John Doe", "Bob Smith"],
			year: 2015,
		},
	],
	presentations: [
		{
			title: "Presentation 1",
			conference: "Conference 1",
			year: 2010,
		},
		{
			title: "Presentation 2",
			conference: "Conference 2",
			year: 2015,
		},
	],
	references: [
		{
			name: "Reference 1",
			title: "Title 1",
			company: "Company 1",
		},
		{
			name: "Reference 2",
			title: "Title 2",
			company: "Company 2",
		},
	],
	numericValues: {
		integer: 12345,
		float: 123.456,
	},
	booleanValues: {
		trueValue: true,
		falseValue: false,
	},
	nullValue: null,
	arrayOfNulls: [null, null, null],
	objectWithNullValues: {
		key1: null,
		key2: null,
		key3: null,
	},
};

const thousandExamplePayloads = Array.from({ length: 1000 }, () =>
	structuredClone(examplePayload),
);

async function quickEncode(value: unknown): Promise<string[]> {
	const chunks: string[] = [];
	const reader = encode(value).getReader();
	try {
		while (true) {
			const { done, value } = await reader.read();
			if (done) {
				break;
			}
			chunks.push(value);
		}
	} finally {
		reader.releaseLock();
	}
	return chunks;
}

function quickDecode(value: unknown): Promise<unknown> {
	return decode(encode(value));
}

boxplot(() => {
	summary(() => {
		group("1000 random numbers", () => {
			bench("JSON", async () => {
				do_not_optimize(await JSON.stringify(thousandRandomNumbers));
			});

			bench("turbo encode", async () => {
				do_not_optimize(await quickEncode(thousandRandomNumbers));
			}).baseline();

			bench("turbo full", async () => {
				do_not_optimize(await quickDecode(thousandRandomNumbers));
			});
		});

		group("1000 random strings", () => {
			bench("JSON", async () => {
				do_not_optimize(await JSON.stringify(thousandRandomStrings));
			});

			bench("turbo encode", async () => {
				do_not_optimize(await quickEncode(thousandRandomStrings));
			}).baseline();

			bench("turbo full", async () => {
				do_not_optimize(await quickDecode(thousandRandomStrings));
			});
		});

		group("realistic payload", () => {
			bench("JSON", async () => {
				do_not_optimize(await JSON.stringify(examplePayload));
			});

			bench("turbo encode", async () => {
				do_not_optimize(await quickEncode(examplePayload));
			}).baseline();

			bench("turbo full", async () => {
				do_not_optimize(await quickDecode(examplePayload));
			});
		});

		group("1000 realistic payload", () => {
			bench("JSON", async () => {
				do_not_optimize(await JSON.stringify(thousandExamplePayloads));
			});

			bench("turbo encode", async () => {
				do_not_optimize(await quickEncode(thousandExamplePayloads));
			}).baseline();

			bench("turbo full", async () => {
				do_not_optimize(await quickDecode(thousandExamplePayloads));
			});
		});
	});
});

await run();
