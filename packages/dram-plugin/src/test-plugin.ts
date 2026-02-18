/**
 * @file Test Plugin Logic
 * @description Standalone verification for the DRAM plugin services and tools.
 */

import { DramSecurityService } from "./services/security.js";
import { EddsConverterTool } from "./tools/edds-converter.js";

async function test() {
    console.log("--- DRAM Plugin Test ---");

    // 1. Test Security Service
    console.log("\n[1/2] Testing Security Service...");
    const mockCtx = {
        stateDir: "./test-vault",
        logger: {
            info: (m: string) => console.log("INFO:", m),
            error: (m: string) => console.error("ERROR:", m)
        }
    };

    const security = new DramSecurityService();
    await security.start(mockCtx as any);

    const secret = { apiKey: "sk-12345" };
    const encrypted = await security.encrypt(secret);
    console.log("Encrypted:", encrypted);

    const decrypted = await security.decrypt(encrypted);
    console.log("Decrypted:", decrypted);

    if (decrypted.apiKey === secret.apiKey) {
        console.log("✅ Security Test Passed");
    }

    // 2. Test EDDS Tool
    console.log("\n[2/2] Testing EDDS Converter Tool...");
    const tool = new EddsConverterTool();
    const toolResult = await tool.execute("test-call", { inputPath: "inventory_icon.edds" });

    console.log("Tool Result Text:", toolResult.content[0].text);
    if (toolResult.details.success) {
        console.log("✅ Tool Test Passed (Path processing ok)");
    }

    await security.stop();
}

test().catch(console.error);
