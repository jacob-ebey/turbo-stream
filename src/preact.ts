import * as preact from "preact";
import * as compat from "preact/compat";

import * as turbo from "./turbo-stream.js";

const TYPE_VNODE = "N";
const TYPE_COMPONENT = "C";
const TYPE_COMPONENT_ERROR = "E";
const TYPE_FRAGMENT = "F";
const TYPE_SUSPENSE = "S";
const TYPE_CLIENT_REFERENCE = "c";
const TYPE_SERVER_REFERENCE = "s";

const CLIENT_REFERENCE = Symbol.for("preact.client.reference");
const SERVER_REFERENCE = Symbol.for("preact.server.reference");

export type ClientReference = {
	$$typeof: symbol;
};

export type EncodedClientReference = [...any[]];

export type EncodeClientReferenceFunction<
	Reference extends ClientReference,
	Encoded extends EncodedClientReference,
> = (reference: Reference) => Encoded;

export type ServerReference = {
	$$typeof: symbol;
};

export type EncodeServerReferenceFunction<Reference extends ServerReference> = (
	reference: Reference,
) => string;

export type DecodeClientReferenceFunction<
	Encoded extends EncodedClientReference,
> = (encoded: Encoded) => Promise<preact.ComponentType<any>>;

export type DecodeServerReferenceFunction = (
	encoded: string,
) => (...args: any[]) => Promise<unknown>;

export type EncodeOptions = turbo.EncodeOptions & {
	encodeClientReference?: EncodeClientReferenceFunction<any, any>;
	encodeServerReference?: EncodeServerReferenceFunction<any>;
};

export type DecodeOptions = turbo.DecodeOptions & {
	decodeClientReference?: DecodeClientReferenceFunction<any>;
	decodeServerReference?: (
		encoded: string,
	) => (...args: unknown[]) => Promise<unknown>;
};

let preactDecode = ({
	decodeClientReference,
	decodeServerReference,
}: DecodeOptions = {}): turbo.DecodePlugin =>
	function (pluginType, keyOrRendered, typeOrProps, props) {
		if (pluginType === TYPE_CLIENT_REFERENCE) {
			if (!decodeClientReference) {
				throw new Error("decodeClientReference implementation not provided");
			}
			const decodePromise = decodeClientReference(
				Array.from(arguments).slice(3),
			);

			const cc = compat.lazy(async () => {
				return {
					default: await decodePromise,
				};
			});
			cc.displayName = "Client Component";

			return {
				value: preact.h(cc, {
					key: keyOrRendered as string,
					...(typeOrProps as preact.Attributes),
				}),
			};
		}

		if (pluginType === TYPE_SERVER_REFERENCE) {
			if (!decodeServerReference) {
				throw new Error("decodeServerReference implementation not provided");
			}
			return {
				value: decodeServerReference(keyOrRendered as string),
			};
		}

		if (pluginType === TYPE_VNODE) {
			return {
				value: preact.h(typeOrProps as string, {
					key: keyOrRendered as string,
					...(props as preact.Attributes),
				}),
			};
		}

		if (pluginType === TYPE_COMPONENT) {
			if (
				typeof keyOrRendered === "object" &&
				keyOrRendered !== null &&
				typeof (keyOrRendered as any).then === "function"
			) {
				const sc = compat.lazy(() =>
					(keyOrRendered as Promise<unknown>).then((resolved) => {
						const rendered = () => resolved as preact.VNode;
						rendered.displayName = "Resolved Content";
						return {
							default: rendered,
						};
					}),
				);
				(sc as any).displayName = "Async Server Component";

				return {
					value: preact.h(sc, null),
				};
			}
			return {
				value: keyOrRendered,
			};
		}

		if (pluginType === TYPE_COMPONENT_ERROR) {
			return {
				value: preact.h(() => {
					throw keyOrRendered;
				}, {}),
			};
		}

		if (pluginType === TYPE_FRAGMENT) {
			return {
				value: preact.h(preact.Fragment, {
					key: keyOrRendered as string,
					...(typeOrProps as preact.Attributes),
				}),
			};
		}

		if (pluginType === TYPE_SUSPENSE) {
			return {
				value: preact.h(compat.Suspense, {
					key: keyOrRendered as string,
					...(typeOrProps as preact.ComponentProps<typeof compat.Suspense>),
				}),
			};
		}
	};

let preactEncode =
	({
		encodeClientReference,
		encodeServerReference,
	}: EncodeOptions = {}): turbo.EncodePlugin =>
	(vnode) => {
		if ((vnode as any).$$typeof === SERVER_REFERENCE) {
			if (!encodeServerReference) {
				throw new Error("encodeServerReference implementation not provided");
			}
			return [
				TYPE_SERVER_REFERENCE,
				encodeServerReference(vnode as ServerReference),
			];
		}

		if (preact.isValidElement(vnode)) {
			// store options hooks once before each synchronous render call
			let beforeDiff = (preact.options as any)[DIFF];
			let afterDiff = (preact.options as any)[DIFFED];
			let renderHook = (preact.options as any)[RENDER];
			let ummountHook = (preact.options as any).unmount;

			if (beforeDiff) beforeDiff(vnode);

			let { key, props, type } = vnode;

			if (type === preact.Fragment) {
				if (afterDiff) afterDiff(vnode);
				if (ummountHook) ummountHook(vnode);
				return [TYPE_FRAGMENT, key, props];
			}

			if ((type as any) === compat.Suspense) {
				return [TYPE_SUSPENSE, key, props];
			}

			if ((type as any).$$typeof === CLIENT_REFERENCE) {
				if (!encodeClientReference) {
					throw new Error("encodeClientReference implementation not provided");
				}
				if (afterDiff) afterDiff(vnode);
				if (ummountHook) ummountHook(vnode);
				return [
					TYPE_CLIENT_REFERENCE,
					key,
					props,
					...encodeClientReference(type as unknown as ClientReference),
				];
			}

			if (typeof type !== "function") {
				return [TYPE_VNODE, key, type, props];
			}

			let isClassComponent =
				type.prototype && typeof type.prototype.render === "function";
			if (isClassComponent) {
				throw new Error("Class components are not supported");
			}

			const previousSkipEffects = (preact.options as any)[SKIP_EFFECTS];
			try {
				(preact.options as any)[SKIP_EFFECTS] = true;

				let component: ComponentType;
				(vnode as any)[COMPONENT] = component = createComponent(
					vnode,
					EMPTY_OBJECT,
				);

				// If a hook invokes setState() to invalidate the component during rendering,
				// re-render it up to 25 times to allow "settling" of memoized states.
				// Note:
				//   This will need to be updated for Preact 11 to use internal.flags rather than component._dirty:
				//   https://github.com/preactjs/preact/blob/d4ca6fdb19bc715e49fd144e69f7296b2f4daa40/src/diff/component.js#L35-L44
				let count = 0;
				let rendered: unknown;
				while (component[DIRTY] && count++ < 25) {
					component[DIRTY] = false;

					if (renderHook) renderHook(vnode);

					try {
						rendered = (type as preact.FunctionComponent).call(
							component,
							props,
							EMPTY_OBJECT,
						);
					} catch (e) {
						if (asyncMode) {
							(vnode as any)._suspended = true;
						}
						throw e;
					}
				}
				component[DIRTY] = true;

				if (afterDiff) afterDiff(vnode);
				if (ummountHook) ummountHook(vnode);

				if (preact.options.unmount) preact.options.unmount(vnode);

				return [
					TYPE_COMPONENT,
					typeof rendered === "object" &&
					typeof (rendered as any).then === "function"
						? (rendered as PromiseLike<unknown>).then(
								(resolved) => resolved,
								(error) => {
									return preact.h(() => {
										throw error;
									}, null);
								},
							)
						: rendered,
				];
			} catch (error) {
				return [TYPE_COMPONENT_ERROR, error];
			} finally {
				if ((preact.options as any)[COMMIT])
					(preact.options as any)[COMMIT](vnode, EMPTY_ARR);
				(preact.options as any)[SKIP_EFFECTS] = previousSkipEffects;
				EMPTY_ARR.length = 0;
			}
		}
	};

export const decode = <T>(
	stream: ReadableStream<string>,
	options?: DecodeOptions,
): Promise<T> =>
	turbo.decode(stream, {
		...options,
		plugins: [preactDecode(options), ...(options?.plugins ?? [])],
	});

export const encode = (value: unknown, options?: EncodeOptions) =>
	turbo.encode(value, {
		...options,
		plugins: [preactEncode(options), ...(options?.plugins ?? [])],
	});

// Preact internals

const EMPTY_ARR: any[] = [];

// Options hooks
const DIFF = "__b";
const RENDER = "__r";
const DIFFED = "diffed";
const COMMIT = "__c";
const CATCH_ERROR = "__e";
const SKIP_EFFECTS = "__s";

// VNode properties
const COMPONENT = "__c";
const CHILDREN = "__k";
const PARENT = "__";
const MASK = "__m";

// Component properties
const VNODE = "__v";
const DIRTY = "__d";
const NEXT_STATE = "__s";
const CHILD_DID_SUSPEND = "__c";
const EMPTY_OBJECT = {};
const asyncMode = false;

type ComponentType = {
	__v: preact.VNode;
	context: any;
	props: any;
	setState: () => void;
	forceUpdate: () => void;
	__d: boolean;
	__h: any[];
	getChildContext?: () => any;
};
function createComponent(vnode: preact.VNode, context: any): ComponentType {
	return {
		__v: vnode,
		context,
		props: vnode.props,
		// silently drop state updates
		setState: markAsDirty,
		forceUpdate: markAsDirty,
		__d: true,
		// hooks
		__h: new Array(0),
	};
}

function markAsDirty(this: ComponentType) {
	this.__d = true;
}
