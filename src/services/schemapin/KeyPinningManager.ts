/**
 * Key pinning manager for SchemaPin
 * Handles storage and retrieval of pinned public keys
 */

import * as vscode from "vscode"
import * as fs from "fs/promises"
import * as path from "path"
import { EventEmitter } from "events"
import { PinnedKeyInfo, SchemaPinConfig, SchemaPinError, SchemaPinErrorType, SchemaPinEventMap } from "./types"

interface KeyDatabase {
	version: string
	keys: Record<string, PinnedKeyInfo>
}

/**
 * Manages pinned keys for SchemaPin verification
 */
export class KeyPinningManager extends EventEmitter {
	private dbPath: string
	private database: KeyDatabase = { version: "1.0", keys: {} }
	private isInitialized = false

	constructor(
		private context: vscode.ExtensionContext,
		private config: SchemaPinConfig,
	) {
		super()
		this.dbPath = config.dbPath || path.join(context.globalStorageUri.fsPath, "schemapin-keys.json")
	}

	/**
	 * Initialize the key manager
	 */
	async initialize(): Promise<void> {
		if (this.isInitialized) {
			return
		}

		try {
			// Ensure the directory exists
			await fs.mkdir(path.dirname(this.dbPath), { recursive: true })

			// Load existing database
			await this.loadDatabase()

			this.isInitialized = true
		} catch (error) {
			throw new SchemaPinError(
				SchemaPinErrorType.DATABASE_ERROR,
				`Failed to initialize key pinning manager: ${error instanceof Error ? error.message : String(error)}`,
				{ dbPath: this.dbPath, originalError: error },
			)
		}
	}

	/**
	 * Pin a public key for a tool
	 */
	async pinKey(toolId: string, publicKeyPem: string, domain: string, developerName?: string): Promise<PinnedKeyInfo> {
		this.ensureInitialized()

		const fingerprint = await this.generateFingerprint(publicKeyPem)
		const keyInfo: PinnedKeyInfo = {
			toolId,
			publicKeyPem,
			domain,
			developerName,
			pinnedAt: new Date(),
			fingerprint,
		}

		this.database.keys[toolId] = keyInfo
		await this.saveDatabase()

		this.emit("keyPinned", {
			toolId,
			domain,
			fingerprint,
		})

		return keyInfo
	}

	/**
	 * Get information about a pinned key
	 */
	async getPinnedKeyInfo(toolId: string): Promise<PinnedKeyInfo | null> {
		this.ensureInitialized()
		return this.database.keys[toolId] || null
	}

	/**
	 * List all pinned keys
	 */
	async listPinnedKeys(): Promise<PinnedKeyInfo[]> {
		this.ensureInitialized()
		return Object.values(this.database.keys)
	}

	/**
	 * Remove a pinned key
	 */
	async removePinnedKey(toolId: string): Promise<boolean> {
		this.ensureInitialized()

		if (this.database.keys[toolId]) {
			const keyInfo = this.database.keys[toolId]
			delete this.database.keys[toolId]
			await this.saveDatabase()

			this.emit("keyRevoked", {
				toolId,
				domain: keyInfo.domain,
				fingerprint: keyInfo.fingerprint,
			})

			return true
		}

		return false
	}

	/**
	 * Update the last verified timestamp for a key
	 */
	async updateLastVerified(toolId: string): Promise<void> {
		this.ensureInitialized()

		if (this.database.keys[toolId]) {
			this.database.keys[toolId].lastVerified = new Date()
			await this.saveDatabase()
		}
	}

	/**
	 * Check if a key is pinned for a tool
	 */
	async isKeyPinned(toolId: string): Promise<boolean> {
		this.ensureInitialized()
		return toolId in this.database.keys
	}

	/**
	 * Verify that a public key matches the pinned key for a tool
	 */
	async verifyPinnedKey(toolId: string, publicKeyPem: string): Promise<boolean> {
		this.ensureInitialized()

		const pinnedKey = this.database.keys[toolId]
		if (!pinnedKey) {
			return false
		}

		// Compare the public keys directly
		return pinnedKey.publicKeyPem.trim() === publicKeyPem.trim()
	}

	/**
	 * Update configuration
	 */
	async updateConfig(newConfig: SchemaPinConfig): Promise<void> {
		this.config = newConfig

		// Update database path if changed
		const newDbPath = newConfig.dbPath || path.join(this.context.globalStorageUri.fsPath, "schemapin-keys.json")
		if (newDbPath !== this.dbPath) {
			this.dbPath = newDbPath
			await this.loadDatabase()
		}
	}

	/**
	 * Dispose of the manager
	 */
	async dispose(): Promise<void> {
		this.removeAllListeners()
		this.isInitialized = false
	}

	/**
	 * Load the key database from disk
	 */
	private async loadDatabase(): Promise<void> {
		try {
			const data = await fs.readFile(this.dbPath, "utf-8")
			const parsed = JSON.parse(data) as KeyDatabase

			// Convert date strings back to Date objects
			for (const key of Object.values(parsed.keys)) {
				key.pinnedAt = new Date(key.pinnedAt)
				if (key.lastVerified) {
					key.lastVerified = new Date(key.lastVerified)
				}
			}

			this.database = parsed
		} catch (error: any) {
			if (error.code === "ENOENT") {
				// File doesn't exist, start with empty database
				this.database = { version: "1.0", keys: {} }
				await this.saveDatabase()
			} else {
				throw new SchemaPinError(
					SchemaPinErrorType.DATABASE_ERROR,
					`Failed to load key database: ${error.message}`,
					{ dbPath: this.dbPath, originalError: error },
				)
			}
		}
	}

	/**
	 * Save the key database to disk
	 */
	private async saveDatabase(): Promise<void> {
		try {
			const data = JSON.stringify(this.database, null, 2)
			await fs.writeFile(this.dbPath, data, "utf-8")
		} catch (error) {
			throw new SchemaPinError(
				SchemaPinErrorType.DATABASE_ERROR,
				`Failed to save key database: ${error instanceof Error ? error.message : String(error)}`,
				{ dbPath: this.dbPath, originalError: error },
			)
		}
	}

	/**
	 * Generate a fingerprint for a public key
	 */
	private async generateFingerprint(publicKeyPem: string): Promise<string> {
		// Simple fingerprint generation using a hash of the key
		// In a real implementation, you might want to use a proper crypto library
		const encoder = new TextEncoder()
		const data = encoder.encode(publicKeyPem.trim())
		const hashBuffer = await crypto.subtle.digest("SHA-256", data)
		const hashArray = Array.from(new Uint8Array(hashBuffer))
		return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("")
	}

	/**
	 * Ensure the manager is initialized
	 */
	private ensureInitialized(): void {
		if (!this.isInitialized) {
			throw new SchemaPinError(
				SchemaPinErrorType.CONFIGURATION_ERROR,
				"Key pinning manager is not initialized. Call initialize() first.",
			)
		}
	}

	/**
	 * Type-safe event emitter methods
	 */
	override emit<K extends keyof SchemaPinEventMap>(event: K, data: SchemaPinEventMap[K]): boolean {
		return super.emit(event, data)
	}

	override on<K extends keyof SchemaPinEventMap>(event: K, listener: (data: SchemaPinEventMap[K]) => void): this {
		return super.on(event, listener)
	}

	override once<K extends keyof SchemaPinEventMap>(event: K, listener: (data: SchemaPinEventMap[K]) => void): this {
		return super.once(event, listener)
	}

	override off<K extends keyof SchemaPinEventMap>(event: K, listener: (data: SchemaPinEventMap[K]) => void): this {
		return super.off(event, listener)
	}
}
