export type { DecodeOptions, DecodePlugin } from "./decode.js";
export { decode } from "./decode.js";

export type { EncodeOptions, EncodePlugin } from "./encode.js";
export { encode } from "./encode.js";

export {
	registerEncodePlugin,
	registerDecodePlugin,
	registerPlugin,
	getGlobalEncodePlugins,
	getGlobalDecodePlugins,
	clearGlobalPlugins,
	unregisterEncodePlugin,
	unregisterDecodePlugin,
	getGlobalEncodePluginCount,
	getGlobalDecodePluginCount,
	globalRegistry,
} from "./plugin-registry.js";
