// npx vitest run src/api/providers/__tests__/bedrock-error-handling.spec.ts

import { vitest, describe, it, expect, beforeEach } from "vitest"
import { AwsBedrockHandler } from "../bedrock"
import { ApiHandlerOptions } from "../../../shared/api"
import { logger } from "../../../utils/logging"

// Mock the logger
vitest.mock("../../../utils/logging", () => ({
	logger: {
		debug: vitest.fn(),
		info: vitest.fn(),
		warn: vitest.fn(),
		error: vitest.fn(),
		fatal: vitest.fn(),
		child: vitest.fn().mockReturnValue({
			debug: vitest.fn(),
			info: vitest.fn(),
			warn: vitest.fn(),
			error: vitest.fn(),
			fatal: vitest.fn(),
		}),
	},
}))

// Mock AWS SDK
vitest.mock("@aws-sdk/client-bedrock-runtime", () => {
	const mockSend = vitest.fn()
	const mockConverseCommand = vitest.fn()

	const MockBedrockRuntimeClient = class {
		public config: any
		public send: any

		constructor(config: { region?: string }) {
			this.config = config
			this.send = mockSend
		}
	}

	return {
		BedrockRuntimeClient: MockBedrockRuntimeClient,
		ConverseCommand: mockConverseCommand,
		ConverseStreamCommand: vitest.fn(),
		// Export the mock functions for test access
		__mockSend: mockSend,
		__mockConverseCommand: mockConverseCommand,
	}
})

describe("Bedrock Error Handling", () => {
	let handler: AwsBedrockHandler

	beforeEach(() => {
		const defaultOptions: ApiHandlerOptions = {
			apiModelId: "anthropic.claude-3-sonnet-20240229-v1:0",
			awsRegion: "us-east-1",
		}
		handler = new AwsBedrockHandler(defaultOptions)
	})

	describe("getErrorType", () => {
		it("should identify throttling errors by HTTP status code 429", () => {
			const error = new Error("Request failed") as any
			error.status = 429

			const errorType = (handler as any).getErrorType(error)
			expect(errorType).toBe("THROTTLING")
		})

		it("should identify throttling errors by AWS metadata httpStatusCode 429", () => {
			const error = new Error("Request failed") as any
			error.$metadata = { httpStatusCode: 429 }

			const errorType = (handler as any).getErrorType(error)
			expect(errorType).toBe("THROTTLING")
		})

		it("should identify throttling errors by ThrottlingException name", () => {
			const error = new Error("Request failed") as any
			error.name = "ThrottlingException"

			const errorType = (handler as any).getErrorType(error)
			expect(errorType).toBe("THROTTLING")
		})

		it("should identify throttling errors by __type ThrottlingException", () => {
			const error = new Error("Request failed") as any
			error.__type = "ThrottlingException"

			const errorType = (handler as any).getErrorType(error)
			expect(errorType).toBe("THROTTLING")
		})

		it("should identify throttling errors by message pattern 'unable to process your request'", () => {
			const error = new Error("Bedrock is unable to process your request")

			const errorType = (handler as any).getErrorType(error)
			expect(errorType).toBe("THROTTLING")
		})

		it("should identify throttling errors by message pattern 'too many tokens'", () => {
			const error = new Error("Too many tokens in request")

			const errorType = (handler as any).getErrorType(error)
			expect(errorType).toBe("THROTTLING")
		})

		it("should identify throttling errors by message pattern 'please wait'", () => {
			const error = new Error("Please wait before making another request")

			const errorType = (handler as any).getErrorType(error)
			expect(errorType).toBe("THROTTLING")
		})

		it("should identify throttling errors by message pattern 'service is temporarily unavailable'", () => {
			const error = new Error("Service is temporarily unavailable")

			const errorType = (handler as any).getErrorType(error)
			expect(errorType).toBe("THROTTLING")
		})

		it("should identify traditional throttling patterns", () => {
			const throttleError = new Error("Request was throttled")
			const rateLimitError = new Error("Rate limit exceeded")
			const limitError = new Error("Limit reached")

			expect((handler as any).getErrorType(throttleError)).toBe("THROTTLING")
			expect((handler as any).getErrorType(rateLimitError)).toBe("THROTTLING")
			expect((handler as any).getErrorType(limitError)).toBe("THROTTLING")
		})

		it("should return GENERIC for non-throttling errors", () => {
			const error = new Error("Some other error")

			const errorType = (handler as any).getErrorType(error)
			expect(errorType).toBe("GENERIC")
		})

		it("should return GENERIC for non-Error objects", () => {
			const error = "string error"

			const errorType = (handler as any).getErrorType(error)
			expect(errorType).toBe("GENERIC")
		})

		it("should identify access denied errors", () => {
			const error = new Error("Access denied to model")

			const errorType = (handler as any).getErrorType(error)
			expect(errorType).toBe("ACCESS_DENIED")
		})

		it("should identify validation errors", () => {
			const error = new Error("Input tag validation failed")

			const errorType = (handler as any).getErrorType(error)
			expect(errorType).toBe("VALIDATION_ERROR")
		})
	})

	describe("handleBedrockError", () => {
		it("should format throttling error messages with guidance", () => {
			const error = new Error("Bedrock is unable to process your request")

			const result = (handler as any).handleBedrockError(error, false)
			expect(result).toContain("Request was throttled or rate limited")
			expect(result).toContain("Reducing the frequency of requests")
		})

		it("should return streaming chunks for streaming context", () => {
			const error = new Error("Some error")

			const result = (handler as any).handleBedrockError(error, true)
			expect(Array.isArray(result)).toBe(true)
			expect(result[0]).toHaveProperty("type", "text")
			expect(result[1]).toHaveProperty("type", "usage")
		})

		it("should return string for non-streaming context", () => {
			const error = new Error("Some error")

			const result = (handler as any).handleBedrockError(error, false)
			expect(typeof result).toBe("string")
			expect(result).toContain("Bedrock completion error:")
		})
	})

	describe("Error handling in createMessage and completePrompt", () => {
		it("should re-throw throttling errors in createMessage for retry handling", async () => {
			const throttlingError = new Error("Bedrock is unable to process your request")

			// Mock the AWS SDK to throw a throttling error
			const mockModule = await import("@aws-sdk/client-bedrock-runtime")
			;(mockModule as any).__mockSend.mockRejectedValueOnce(throttlingError)

			const generator = handler.createMessage("test", [])

			// The throttling error should be re-thrown, not handled as a streaming error
			await expect(generator.next()).rejects.toThrow("Bedrock is unable to process your request")
		})

		it("should re-throw throttling errors in completePrompt for retry handling", async () => {
			const throttlingError = new Error("Too many tokens") as any
			throttlingError.status = 429

			// Mock the AWS SDK to throw a throttling error
			const mockModule = await import("@aws-sdk/client-bedrock-runtime")
			;(mockModule as any).__mockSend.mockRejectedValueOnce(throttlingError)

			// The throttling error should be re-thrown, not handled as a completion error
			await expect(handler.completePrompt("test")).rejects.toThrow("Too many tokens")
		})

		it("should handle non-throttling errors normally in createMessage", async () => {
			const genericError = new Error("Some other error")

			// Mock the AWS SDK to throw a generic error
			const mockModule = await import("@aws-sdk/client-bedrock-runtime")
			;(mockModule as any).__mockSend.mockRejectedValueOnce(genericError)

			const generator = handler.createMessage("test", [])

			// Generic errors should be handled as streaming errors, not re-thrown
			const result = await generator.next()
			expect(result.value).toHaveProperty("type", "text")
			expect(result.value.text).toContain("Error:")
		})

		it("should handle non-throttling errors normally in completePrompt", async () => {
			const genericError = new Error("Some other error")

			// Mock the AWS SDK to throw a generic error
			const mockModule = await import("@aws-sdk/client-bedrock-runtime")
			;(mockModule as any).__mockSend.mockRejectedValueOnce(genericError)

			// Generic errors should be handled as completion errors
			await expect(handler.completePrompt("test")).rejects.toThrow("Bedrock completion error:")
		})
	})
})
