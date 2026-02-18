/**
 * @file DRAM Security Service
 * @description Manages encrypted storage and OS Keychain integration.
 * @module @dram/plugin-core/services
 */

import fs from "fs/promises";
import path from "path";
import crypto from "crypto";
import type { OpenClawPluginService, OpenClawPluginServiceContext } from "@mariozechner/openclaw-plugin-sdk";

/**
 * Service for handling sensitive data encryption and storage.
 * 
 * @golden_rule 3 (Security First): Designed to interface with safeStorage.
 */
export class DramSecurityService implements OpenClawPluginService {
    /** The unique identifier for this service */
    public id: string = "dram-security";
    private ctx: OpenClawPluginServiceContext | undefined;
    private storageDir: string | undefined;
    private keyPath: string | undefined;
    private key: Buffer | undefined;
    private initialized: boolean = false;

    /**
     * Service constructor. Lifecycle context is provided via the start() method.
     */
    constructor() { }

    /**
     * Initializes the security vault directory.
     * @async
     * @param {OpenClawPluginServiceContext} ctx - The OpenClaw Plugin service context.
     */
    async start(ctx: OpenClawPluginServiceContext): Promise<void> {
        this.ctx = ctx;
        this.storageDir = path.join(ctx.stateDir || process.cwd(), "dram-vault");
        this.keyPath = path.join(this.storageDir, ".vault-key");

        try {
            await fs.mkdir(this.storageDir, { recursive: true });
            await this.getOrCreateKey();
            this.initialized = true;
            this.ctx.logger.info("[DRAM-Security] Vault initialized.");
        } catch (error) {
            this.ctx.logger.error(`[DRAM-Security] Initialization failed: ${error}`);
        }
    }

    /**
     * Shuts down the security service.
     * @async
     */
    async stop(): Promise<void> {
        this.initialized = false;
        this.key = undefined;
        this.ctx?.logger.info("[DRAM-Security] Service stopped.");
    }

    private async getOrCreateKey(): Promise<Buffer> {
        if (this.key) return this.key;
        if (!this.keyPath) throw new Error("Security service not initialized");

        try {
            const raw = (await fs.readFile(this.keyPath, "utf-8")).trim();
            const parsed = Buffer.from(raw, "hex");
            if (parsed.length === 32) {
                this.key = parsed;
                return this.key;
            }
        } catch {
            // Key does not exist yet; create below.
        }

        const generated = crypto.randomBytes(32);
        await fs.writeFile(this.keyPath, generated.toString("hex"), { mode: 0o600 });
        this.key = generated;
        return generated;
    }

    /**
     * Encrypts sensitive data using the machine-level identity.
     * 
     * @param {any} data - The data to encrypt.
     * @returns {Promise<string>} The base64 encoded encrypted string.
     */
    async encrypt(data: any): Promise<string> {
        const key = await this.getOrCreateKey();
        const iv = crypto.randomBytes(12);
        const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
        const plaintext = Buffer.from(JSON.stringify(data), "utf-8");
        const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
        const tag = cipher.getAuthTag();

        const envelope = {
            v: 1,
            alg: "aes-256-gcm",
            iv: iv.toString("base64"),
            tag: tag.toString("base64"),
            data: ciphertext.toString("base64")
        };
        return Buffer.from(JSON.stringify(envelope), "utf-8").toString("base64");
    }

    /**
     * Decrypts previously encrypted data.
     * 
     * @param {string} encrypted - The base64 encoded string to decrypt.
     * @returns {Promise<any>} The original data object.
     */
    async decrypt(encrypted: string): Promise<any> {
        try {
            const decoded = Buffer.from(encrypted, "base64").toString("utf-8");
            const parsed = JSON.parse(decoded);

            // New envelope format
            if (parsed && parsed.v === 1 && parsed.alg === "aes-256-gcm" && parsed.iv && parsed.tag && parsed.data) {
                const key = await this.getOrCreateKey();
                const decipher = crypto.createDecipheriv(
                    "aes-256-gcm",
                    key,
                    Buffer.from(parsed.iv, "base64")
                );
                decipher.setAuthTag(Buffer.from(parsed.tag, "base64"));
                const plaintext = Buffer.concat([
                    decipher.update(Buffer.from(parsed.data, "base64")),
                    decipher.final()
                ]);
                return JSON.parse(plaintext.toString("utf-8"));
            }

            // Backward compatibility with old base64(JSON) payloads
            return parsed;
        } catch (err) {
            this.ctx?.logger.error("[DRAM-Security] Decryption failed.");
            throw err;
        }
    }
}
