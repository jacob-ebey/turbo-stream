import type { EncodePlugin, DecodePlugin } from "./turbo-stream.js";

/**
 * Global plugin registry for turbo-stream
 * Allows registering plugins that will be automatically used by all encode/decode calls
 */
class PluginRegistry {
	private encodePlugins: EncodePlugin[] = [];
	private decodePlugins: DecodePlugin[] = [];

	/**
	 * Register an encode plugin that will be used by all encode calls
	 * @param plugin The encode plugin to register
	 */
	registerEncodePlugin(plugin: EncodePlugin): void {
		this.encodePlugins.push(plugin);
	}

	/**
	 * Register a decode plugin that will be used by all decode calls
	 * @param plugin The decode plugin to register
	 */
	registerDecodePlugin(plugin: DecodePlugin): void {
		this.decodePlugins.push(plugin);
	}

	/**
	 * Register both encode and decode plugins for a complete serialization solution
	 * @param encodePlugin The encode plugin to register
	 * @param decodePlugin The decode plugin to register
	 */
	registerPlugin(encodePlugin: EncodePlugin, decodePlugin: DecodePlugin): void {
		this.registerEncodePlugin(encodePlugin);
		this.registerDecodePlugin(decodePlugin);
	}

	/**
	 * Get all registered encode plugins
	 * @returns Array of registered encode plugins
	 */
	getEncodePlugins(): readonly EncodePlugin[] {
		return this.encodePlugins;
	}

	/**
	 * Get all registered decode plugins
	 * @returns Array of registered decode plugins
	 */
	getDecodePlugins(): readonly DecodePlugin[] {
		return this.decodePlugins;
	}

	/**
	 * Clear all registered plugins
	 */
	clear(): void {
		this.encodePlugins = [];
		this.decodePlugins = [];
	}

	/**
	 * Remove a specific encode plugin
	 * @param plugin The plugin to remove
	 */
	unregisterEncodePlugin(plugin: EncodePlugin): void {
		const index = this.encodePlugins.indexOf(plugin);
		if (index !== -1) {
			this.encodePlugins.splice(index, 1);
		}
	}

	/**
	 * Remove a specific decode plugin
	 * @param plugin The plugin to remove
	 */
	unregisterDecodePlugin(plugin: DecodePlugin): void {
		const index = this.decodePlugins.indexOf(plugin);
		if (index !== -1) {
			this.decodePlugins.splice(index, 1);
		}
	}

	/**
	 * Get the number of registered encode plugins
	 */
	get encodePluginCount(): number {
		return this.encodePlugins.length;
	}

	/**
	 * Get the number of registered decode plugins
	 */
	get decodePluginCount(): number {
		return this.decodePlugins.length;
	}
}

// Create a singleton instance
const globalRegistry = new PluginRegistry();

/**
 * Register an encode plugin globally
 * @param plugin The encode plugin to register
 */
export function registerEncodePlugin(plugin: EncodePlugin): void {
	globalRegistry.registerEncodePlugin(plugin);
}

/**
 * Register a decode plugin globally
 * @param plugin The decode plugin to register
 */
export function registerDecodePlugin(plugin: DecodePlugin): void {
	globalRegistry.registerDecodePlugin(plugin);
}

/**
 * Register both encode and decode plugins globally
 * @param encodePlugin The encode plugin to register
 * @param decodePlugin The decode plugin to register
 */
export function registerPlugin(encodePlugin: EncodePlugin, decodePlugin: DecodePlugin): void {
	globalRegistry.registerPlugin(encodePlugin, decodePlugin);
}

/**
 * Get all globally registered encode plugins
 * @returns Array of registered encode plugins
 */
export function getGlobalEncodePlugins(): readonly EncodePlugin[] {
	return globalRegistry.getEncodePlugins();
}

/**
 * Get all globally registered decode plugins
 * @returns Array of registered decode plugins
 */
export function getGlobalDecodePlugins(): readonly DecodePlugin[] {
	return globalRegistry.getDecodePlugins();
}

/**
 * Clear all globally registered plugins
 */
export function clearGlobalPlugins(): void {
	globalRegistry.clear();
}

/**
 * Remove a specific encode plugin from global registry
 * @param plugin The plugin to remove
 */
export function unregisterEncodePlugin(plugin: EncodePlugin): void {
	globalRegistry.unregisterEncodePlugin(plugin);
}

/**
 * Remove a specific decode plugin from global registry
 * @param plugin The plugin to remove
 */
export function unregisterDecodePlugin(plugin: DecodePlugin): void {
	globalRegistry.unregisterDecodePlugin(plugin);
}

/**
 * Get the number of globally registered encode plugins
 */
export function getGlobalEncodePluginCount(): number {
	return globalRegistry.encodePluginCount;
}

/**
 * Get the number of globally registered decode plugins
 */
export function getGlobalDecodePluginCount(): number {
	return globalRegistry.decodePluginCount;
}

// Export the registry instance for advanced usage
export { globalRegistry };

// Expose the registry globally for access by encode/decode functions
if (typeof globalThis !== "undefined") {
	(globalThis as any).__turboStreamPluginRegistry = {
		getGlobalEncodePlugins,
		getGlobalDecodePlugins,
	};
} 