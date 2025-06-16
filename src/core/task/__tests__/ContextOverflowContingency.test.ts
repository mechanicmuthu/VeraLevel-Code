import { Task } from "../Task"
import { ClineProvider } from "../../webview/ClineProvider"
import { ContextProxy } from "../../config/ContextProxy"
import { buildApiHandler } from "../../../api"
import { ModeConfig } from "@roo-code/types"
import { TelemetryService } from "@roo-code/telemetry"

// Mock dependencies
jest.mock("../../webview/ClineProvider")
jest.mock("../../config/ContextProxy")
jest.mock("../../../api")
jest.mock("@roo-code/telemetry")

describe("Context Overflow Contingency", () => {
	let mockProvider: jest.Mocked<ClineProvider>
	let mockContextProxy: jest.Mocked<ContextProxy>
	let task: Task

	beforeEach(() => {
		// Mock TelemetryService
		const mockTelemetryService = {
			captureTaskCreated: jest.fn(),
			captureTaskRestarted: jest.fn(),
		}
		;(TelemetryService as any).instance = mockTelemetryService

		mockProvider = {
			getState: jest.fn(),
			context: {
				globalStorageUri: { fsPath: "/test/storage" },
			},
		} as any

		mockContextProxy = {
			extensionUri: { fsPath: "/test/extension" },
		} as any

		const mockApiHandler = {
			getModel: () => ({
				id: "test-model",
				info: {
					contextWindow: 100000,
					maxTokens: 4096,
				},
			}),
			countTokens: jest.fn().mockResolvedValue(1000),
		}

		;(buildApiHandler as jest.Mock).mockReturnValue(mockApiHandler)
	})

	afterEach(() => {
		jest.clearAllMocks()
	})

	it("should not trigger contingency for non-subtasks", async () => {
		const modeConfig: ModeConfig = {
			slug: "test-mode",
			name: "Test Mode",
			roleDefinition: "Test role",
			groups: ["read"],
			contextOverflowContingency: {
				enabled: true,
				message: "Context overflow detected",
			},
		}

		mockProvider.getState.mockResolvedValue({
			mode: "test-mode",
			customModes: [modeConfig],
			apiConfiguration: { apiProvider: "anthropic" },
		} as any)

		task = new Task({
			provider: mockProvider,
			apiConfiguration: { apiProvider: "anthropic" } as any,
			task: "Test task",
			startTask: false,
		})

		// Mock token usage to simulate high context usage
		jest.spyOn(task, "getTokenUsage").mockReturnValue({
			contextTokens: 95000, // 95% of 100k context window
			totalTokensIn: 0,
			totalTokensOut: 0,
			totalCost: 0,
		})

		const checkMethod = (task as any).checkContextOverflowContingency.bind(task)

		// Should not throw or trigger contingency for non-subtasks
		await expect(checkMethod()).resolves.not.toThrow()
		expect(task.abort).toBe(false)
	})

	it("should trigger contingency for subtasks when context exceeds threshold", async () => {
		const modeConfig: ModeConfig = {
			slug: "test-mode",
			name: "Test Mode",
			roleDefinition: "Test role",
			groups: ["read"],
			contextOverflowContingency: {
				enabled: true,
				message: "Custom overflow message",
			},
		}

		mockProvider.getState.mockResolvedValue({
			mode: "test-mode",
			customModes: [modeConfig],
			apiConfiguration: { apiProvider: "anthropic" },
		} as any)

		// Create parent task first
		const parentTask = new Task({
			provider: mockProvider,
			apiConfiguration: { apiProvider: "anthropic" } as any,
			task: "Parent task",
			startTask: false,
		})

		// Create subtask
		task = new Task({
			provider: mockProvider,
			apiConfiguration: { apiProvider: "anthropic" } as any,
			task: "Subtask",
			parentTask,
			startTask: false,
		})

		// Mock token usage to simulate high context usage
		jest.spyOn(task, "getTokenUsage").mockReturnValue({
			contextTokens: 95000, // 95% of 100k context window
			totalTokensIn: 0,
			totalTokensOut: 0,
			totalCost: 0,
		})

		// Mock the say method to track calls
		const sayMock = jest.spyOn(task, "say").mockResolvedValue(undefined)
		const handleAttemptCompletionMock = jest
			.spyOn(task as any, "handleAttemptCompletion")
			.mockResolvedValue(undefined)

		const checkMethod = (task as any).checkContextOverflowContingency.bind(task)
		await checkMethod()

		// Should trigger contingency
		expect(sayMock).toHaveBeenCalledWith("text", expect.stringContaining("Context overflow detected"))
		expect(handleAttemptCompletionMock).toHaveBeenCalledWith("Custom overflow message")
		expect(task.abort).toBe(true)
	})

	it("should use tool-specific message when available", async () => {
		const modeConfig: ModeConfig = {
			slug: "test-mode",
			name: "Test Mode",
			roleDefinition: "Test role",
			groups: ["read", "browser"],
			contextOverflowContingency: {
				enabled: true,
				message: "Default overflow message",
				toolSpecific: {
					browser_action: "Browser action caused context overflow",
				},
			},
		}

		mockProvider.getState.mockResolvedValue({
			mode: "test-mode",
			customModes: [modeConfig],
			apiConfiguration: { apiProvider: "anthropic" },
		} as any)

		// Create parent task first
		const parentTask = new Task({
			provider: mockProvider,
			apiConfiguration: { apiProvider: "anthropic" } as any,
			task: "Parent task",
			startTask: false,
		})

		// Create subtask
		task = new Task({
			provider: mockProvider,
			apiConfiguration: { apiProvider: "anthropic" } as any,
			task: "Subtask",
			parentTask,
			startTask: false,
		})

		// Mock recent messages to include browser action
		task.clineMessages = [
			{
				ts: Date.now(),
				type: "say",
				say: "text",
				text: "<browser_action>",
			},
		] as any

		// Mock token usage to simulate high context usage
		jest.spyOn(task, "getTokenUsage").mockReturnValue({
			contextTokens: 95000, // 95% of 100k context window
			totalTokensIn: 0,
			totalTokensOut: 0,
			totalCost: 0,
		})

		// Mock the say method to track calls
		const sayMock = jest.spyOn(task, "say").mockResolvedValue(undefined)
		const handleAttemptCompletionMock = jest
			.spyOn(task as any, "handleAttemptCompletion")
			.mockResolvedValue(undefined)

		const checkMethod = (task as any).checkContextOverflowContingency.bind(task)
		await checkMethod()

		// Should use tool-specific message
		expect(handleAttemptCompletionMock).toHaveBeenCalledWith("Browser action caused context overflow")
		expect(task.abort).toBe(true)
	})

	it("should not trigger when contingency is disabled", async () => {
		const modeConfig: ModeConfig = {
			slug: "test-mode",
			name: "Test Mode",
			roleDefinition: "Test role",
			groups: ["read"],
			contextOverflowContingency: {
				enabled: false,
				message: "This should not be used",
			},
		}

		mockProvider.getState.mockResolvedValue({
			mode: "test-mode",
			customModes: [modeConfig],
			apiConfiguration: { apiProvider: "anthropic" },
		} as any)

		// Create parent task first
		const parentTask = new Task({
			provider: mockProvider,
			apiConfiguration: { apiProvider: "anthropic" } as any,
			task: "Parent task",
			startTask: false,
		})

		// Create subtask
		task = new Task({
			provider: mockProvider,
			apiConfiguration: { apiProvider: "anthropic" } as any,
			task: "Subtask",
			parentTask,
			startTask: false,
		})

		// Mock token usage to simulate high context usage
		jest.spyOn(task, "getTokenUsage").mockReturnValue({
			contextTokens: 95000, // 95% of 100k context window
			totalTokensIn: 0,
			totalTokensOut: 0,
			totalCost: 0,
		})

		const checkMethod = (task as any).checkContextOverflowContingency.bind(task)
		await checkMethod()

		// Should not trigger contingency
		expect(task.abort).toBe(false)
	})
})
