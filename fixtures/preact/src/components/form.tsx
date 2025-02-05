"use client";

import { createContext, type JSX, type ComponentProps } from "preact";
import { useCallback, useContext, useRef, useState } from "preact/hooks";

type FormStatus = {
	action: ((formData: FormData) => void | Promise<void>) | null;
	data: FormData | null;
	method: "post";
	pending: boolean;
};

const FormContext = createContext<FormStatus | null>(null);

type FormProps = Omit<ComponentProps<"form">, "action" | "method"> & {
	action: string | ((formData: FormData) => void | Promise<void>);
};

export function Form({ action, onSubmit, ...props }: FormProps) {
	const [status, setStatus] = useState<FormStatus>({
		action: typeof action === "function" ? action : null,
		data: null,
		method: "post",
		pending: false,
	});
	const controllerRef = useRef(new AbortController());

	const formOnSubmit = useCallback(
		(event: JSX.TargetedSubmitEvent<HTMLFormElement>) => {
			onSubmit?.(event);
			if (event.defaultPrevented) return;
			event.preventDefault();
			const formData = new FormData(event.currentTarget, event.submitter);
			setStatus((prev) => ({ ...prev, data: formData, pending: true }));
			controllerRef.current.abort();
			controllerRef.current = new AbortController();
			const { signal } = controllerRef.current;
			(async () => {
				if (typeof action === "function") {
					await action(formData);
				}
			})().finally(() => {
				setStatus((prev) => ({ ...prev, data: null, pending: false }));
			});
		},
		[onSubmit, action],
	);

	const formAction = typeof action === "string" ? action : undefined;

	return (
		<FormContext.Provider value={status}>
			<form {...props} action={formAction} onSubmit={formOnSubmit} />
		</FormContext.Provider>
	);
}

export function useFormStatus() {
	const ctx = useContext(FormContext);
	if (!ctx) {
		throw new Error("useFormStatus must be used within a Form component");
	}
	return ctx;
}
