/**
 * Tests for SchemaPinService
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import * as vscode from "vscode"
import { SchemaPinService } from "../SchemaPinService"
import { SchemaPinConfig } from "../types"

// Mock vscode
vi.mock("vscode", () => ({
	ExtensionContext: vi.fn(),
	workspace: {
		getConfiguration: vi.fn(),
	},
}))

describe("SchemaPinService", () => {
	let service: SchemaPinService
	let mockContext: vscode.ExtensionContext

	beforeEach(() => {
		mockContext = {
			globalStorageUri: {
				fsPath: "/tmp/test-storage",
			},
		} as any

		const config: Partial<SchemaPinConfig> = {
			enabled: true,
			autoPin: false,
			timeout: 5000,
			verifyOnToolCall: true,
		}

		service = new SchemaPinService(mockContext, config)
	})

	afterEach(async () => {
		if (service) {
			await service.dispose()
		}
	})

	describe("initialization", () => {
		it("should initialize successfully", async () => {
			await expect(service.initialize()).resolves.not.toThrow()
			expect(service.isEnabled()).toBe(true)
		})

		it("should handle disabled state", () => {
			const disabledService = new SchemaPinService(mockContext, { enabled: false })
			expect(disabledService.isEnabled()).toBe(false)
		})
	})

	describe("configuration", () => {
		it("should return current configuration", async () => {
			await service.initialize()
			const config = service.getConfig()
			expect(config.enabled).toBe(true)
			expect(config.autoPin).toBe(false)
		})

		it("should update configuration", async () => {
			await service.initialize()
			await service.updateConfig({ autoPin: true })
			const config = service.getConfig()
			expect(config.autoPin).toBe(true)
		})
	})

	describe("MCP tool verification", () => {
		it("should handle tools without signatures", async () => {
			// Create service with verifyOnToolCall disabled
			const nonStrictService = new SchemaPinService(mockContext, {
				enabled: true,
				verifyOnToolCall: false,
			})
			await nonStrictService.initialize()

			const result = await nonStrictService.verifyMcpTool({
				serverName: "test-server",
				toolName: "test-tool",
				schema: { type: "object" },
				// No signature provided
			})

			// Should pass when verification is not required
			expect(result.valid).toBe(true)
			expect(result.pinned).toBe(false)
			expect(result.firstUse).toBe(false)

			await nonStrictService.dispose()
		})

		it("should verify tools with signatures", async () => {
			await service.initialize()

			const result = await service.verifyMcpTool({
				serverName: "test-server",
				toolName: "test-tool",
				schema: { type: "object", properties: { test: { type: "string" } } },
				signature: "mock-signature-data",
				domain: "example.com",
			})

			// Should attempt verification when signature is provided
			expect(result.valid).toBe(true)
			expect(result.firstUse).toBe(true)
		})
	})

	describe("key management", () => {
		it("should list pinned keys", async () => {
			await service.initialize()
			const keys = await service.listPinnedKeys()
			expect(Array.isArray(keys)).toBe(true)
		})

		it("should handle non-existent keys", async () => {
			await service.initialize()
			const keyInfo = await service.getPinnedKeyInfo("non-existent-tool")
			expect(keyInfo).toBeNull()
		})
	})
})
