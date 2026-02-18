/**
 * @file DRAM Core Plugin Entry Point
 * @description Registers security services and specialized tools for the OpenClaw engine.
 * @module @dram/plugin-core
 * @license MIT
 */

import type { OpenClawPluginApi } from "@mariozechner/openclaw-plugin-sdk";
import { DramSecurityService } from "./services/security.js";
import { EddsConverterTool } from "./tools/edds-converter.js";

/**
 * Validates the plugin environment and registers all DRAM services.
 * 
 * @async
 * @param {OpenClawPluginApi} api - The OpenClaw Plugin API instance.
 * @returns {Promise<void>}
 * 
 * @golden_rule 1 (Modular): This function handles registration only.
 * @golden_rule 4 (DRAM Engine): Integrates specialized security and tool discovery.
 */
export const activate = (api: OpenClawPluginApi): void => {
    api.logger.info(`[DRAM] Activating Core Suite v${api.version || "1.0.0"}`);

    try {
        // 1. Initialize Security Service (OS Keychain integration)
        const securityService = new DramSecurityService();
        api.registerService(securityService);
        api.logger.debug?.("[DRAM] Registered Security Service");

        // 2. Register Specialized Media Tools
        api.registerTool(new EddsConverterTool());
        api.logger.debug?.("[DRAM] Registered EDDS Converter Tool");

        // 3. Register Canvas Hooks (Future integration)
        // api.on("canvas_ready", () => { ... });

        api.logger.info("[DRAM] Plugin fully operational.");
    } catch (error) {
        api.logger.error(`[DRAM] Failed to activate: ${error instanceof Error ? error.message : String(error)}`);
        throw error;
    }
};

/**
 * Clean up resources during plugin deactivation.
 * 
 * @async
 * @param {DramPluginApi} api - The OpenClaw Plugin API instance.
 * @returns {Promise<void>}
 */
export const deactivate = async (api: OpenClawPluginApi): Promise<void> => {
    api.logger.info("[DRAM] Gracefully shutting down Core Suite.");
    // Add cleanup logic for services if necessary
};
