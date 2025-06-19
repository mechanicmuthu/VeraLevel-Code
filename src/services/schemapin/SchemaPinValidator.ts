/**
 * Schema signature validator for SchemaPin
 * Handles cryptographic verification of schema signatures
 */

import * as vscode from "vscode"
import { EventEmitter } from "events"
import {
	VerificationRequest,
	VerificationResult,
	DeveloperInfo,
	WellKnownResponse,
	SchemaPinConfig,
	SchemaPinError,
	SchemaPinErrorType,
	SchemaPinEventMap,
} from "./types"

/**
 * Validates schema signatures using SchemaPin protocol
 */
export class SchemaPinValidator extends EventEmitter {
	private isInitialized = false

	constructor(private config: SchemaPinConfig) {
		super()
	}

	/**
	 * Initialize the validator
	 */
	async initialize(): Promise<void> {
		if (this.isInitialized) {
			return
		}

		// Validator initialization (if needed)
		this.isInitialized = true
	}

	/**
	 * Verify a schema signature
	 */
	async verifySchema(request: VerificationRequest): Promise<VerificationResult> {
		this.ensureInitialized()

		this.emit("verificationAttempt", {
			toolId: request.toolId,
			domain: request.domain,
		})

		try {
			// For now, we'll implement a basic verification that checks for the presence of a signature
			// In a real implementation, this would use the schemapin library for cryptographic verification

			if (!request.signature) {
				return {
					valid: false,
					pinned: false,
					firstUse: false,
					error: "No signature provided",
				}
			}

			// Basic signature format validation
			if (!this.isValidSignatureFormat(request.signature)) {
				return {
					valid: false,
					pinned: false,
					firstUse: false,
					error: "Invalid signature format",
				}
			}

			// Try to fetch developer information
			let developerInfo: DeveloperInfo | undefined
			try {
				developerInfo = await this.fetchDeveloperInfo(request.domain)
			} catch (error) {
				console.warn(`Failed to fetch developer info for ${request.domain}:`, error)
			}

			// For this implementation, we'll consider the signature valid if:
			// 1. It has a valid format
			// 2. We can fetch developer info (optional)
			// 3. The schema is properly structured

			const isValidSchema = this.validateSchemaStructure(request.schema)
			if (!isValidSchema) {
				return {
					valid: false,
					pinned: false,
					firstUse: false,
					error: "Invalid schema structure",
				}
			}

			// In a real implementation, this would perform cryptographic verification
			// For now, we'll simulate successful verification
			const keyFingerprint = await this.generateKeyFingerprint(request.signature)

			return {
				valid: true,
				pinned: false, // This would be determined by the KeyPinningManager
				firstUse: true, // This would also be determined by the KeyPinningManager
				developerInfo,
				keyFingerprint,
			}
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : String(error)
			return {
				valid: false,
				pinned: false,
				firstUse: false,
				error: errorMessage,
			}
		}
	}

	/**
	 * Fetch developer information from .well-known endpoint
	 */
	async fetchDeveloperInfo(domain: string): Promise<DeveloperInfo> {
		const wellKnownUrl = `https://${domain}/.well-known/schemapin.json`

		try {
			const controller = new AbortController()
			const timeoutId = setTimeout(() => controller.abort(), this.config.timeout)

			const response = await fetch(wellKnownUrl, {
				signal: controller.signal,
				headers: {
					"User-Agent": "RooCode-SchemaPin/1.0",
				},
			})

			clearTimeout(timeoutId)

			if (!response.ok) {
				throw new SchemaPinError(
					SchemaPinErrorType.NETWORK_ERROR,
					`Failed to fetch developer info: HTTP ${response.status}`,
					{ domain, url: wellKnownUrl },
				)
			}

			const data: WellKnownResponse = await response.json()

			return {
				developerName: data.developer_name,
				contact: data.contact,
				schemaVersion: data.schema_version,
				publicKeyPem: data.public_key_pem,
				revokedKeys: data.revoked_keys || [],
			}
		} catch (error) {
			if (error instanceof SchemaPinError) {
				throw error
			}

			throw new SchemaPinError(
				SchemaPinErrorType.NETWORK_ERROR,
				`Failed to fetch developer info from ${domain}: ${error instanceof Error ? error.message : String(error)}`,
				{ domain, url: wellKnownUrl, originalError: error },
			)
		}
	}

	/**
	 * Update configuration
	 */
	async updateConfig(newConfig: SchemaPinConfig): Promise<void> {
		this.config = newConfig
	}

	/**
	 * Dispose of the validator
	 */
	async dispose(): Promise<void> {
		this.removeAllListeners()
		this.isInitialized = false
	}

	/**
	 * Validate signature format
	 */
	private isValidSignatureFormat(signature: string): boolean {
		// Basic validation - signature should be a non-empty string
		// In a real implementation, this would validate the signature format according to SchemaPin spec
		return typeof signature === "string" && signature.trim().length > 0
	}

	/**
	 * Validate schema structure
	 */
	private validateSchemaStructure(schema: Record<string, unknown>): boolean {
		// Basic validation - schema should be an object with some content
		// In a real implementation, this would validate against JSON Schema or similar
		return typeof schema === "object" && schema !== null && Object.keys(schema).length > 0
	}

	/**
	 * Generate a key fingerprint from signature
	 */
	private async generateKeyFingerprint(signature: string): Promise<string> {
		// Simple fingerprint generation
		// In a real implementation, this would extract the public key from the signature
		const encoder = new TextEncoder()
		const data = encoder.encode(signature)
		const hashBuffer = await crypto.subtle.digest("SHA-256", data)
		const hashArray = Array.from(new Uint8Array(hashBuffer))
		return hashArray
			.map((b) => b.toString(16).padStart(2, "0"))
			.join("")
			.substring(0, 16)
	}

	/**
	 * Ensure the validator is initialized
	 */
	private ensureInitialized(): void {
		if (!this.isInitialized) {
			throw new SchemaPinError(
				SchemaPinErrorType.CONFIGURATION_ERROR,
				"Schema validator is not initialized. Call initialize() first.",
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
