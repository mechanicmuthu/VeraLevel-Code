import fs from "fs/promises"
import path from "path"
import { jest } from "@jest/globals"

import { searchAndReplaceTool } from "../searchAndReplaceTool"
import { Task } from "../../task/Task"
import { ToolUse, AskApproval, HandleError, PushToolResult, RemoveClosingTag } from "../../../shared/tools"
import { fileExistsAtPath } from "../../../utils/fs"

// Mock dependencies
jest.mock("fs/promises")
jest.mock("../../task/Task")
jest.mock("../../../utils/fs", () => ({
	fileExistsAtPath: jest.fn(),
}))

const mockFs = fs as jest.Mocked<typeof fs>
const mockFileExistsAtPath = fileExistsAtPath as jest.MockedFunction<typeof fileExistsAtPath>

describe("searchAndReplaceTool", () => {
	let mockTask: jest.Mocked<Task>
	let mockPushToolResult: PushToolResult
	let mockAskApproval: AskApproval
	let mockHandleError: HandleError
	let mockRemoveClosingTag: RemoveClosingTag

	beforeEach(() => {
		// Reset all mocks
		jest.clearAllMocks()

		// Mock Task instance
		mockTask = {
			consecutiveMistakeCount: 0,
			cwd: "/test/workspace",
			recordToolError: jest.fn(),
			sayAndCreateMissingParamError: jest.fn(),
			say: jest.fn(),
			ask: jest.fn(),
			diffViewProvider: {
				editType: "",
				originalContent: "",
				isEditing: false,
				open: jest.fn(),
				update: jest.fn(),
				scrollToFirstDiff: jest.fn(),
				reset: jest.fn(),
				revertChanges: jest.fn(),
				saveChanges: jest.fn(),
				pushToolWriteResult: jest.fn(() => Promise.resolve("File updated successfully")) as any,
			},
			rooIgnoreController: {
				validateAccess: jest.fn().mockReturnValue(true),
			},
			rooProtectedController: {
				isWriteProtected: jest.fn().mockReturnValue(false),
			},
			fileContextTracker: {
				trackFileContext: jest.fn(),
			},
			didEditFile: false,
			recordToolUsage: jest.fn(),
		} as any

		// Mock helper functions
		mockPushToolResult = jest.fn() as PushToolResult
		mockAskApproval = jest.fn(() => Promise.resolve(true)) as jest.MockedFunction<AskApproval>
		mockHandleError = jest.fn(() => Promise.resolve()) as jest.MockedFunction<HandleError>
		mockRemoveClosingTag = jest.fn(
			(tag: string, value?: string) => value || "",
		) as jest.MockedFunction<RemoveClosingTag>

		// Mock file system
		mockFs.readFile.mockResolvedValue("test content")
		mockFileExistsAtPath.mockResolvedValue(true)
	})

	describe("multiple match detection", () => {
		it("should fail when search query matches multiple locations in entire file", async () => {
			const fileContent = `function test() {
    return true;
}

function another() {
    return false;
}

function third() {
    return null;
}`

			mockFs.readFile.mockResolvedValue(fileContent)

			const toolUse: ToolUse = {
				type: "tool_use",
				name: "search_and_replace",
				params: {
					path: "test.js",
					search: "}",
					replace: "} // modified",
				},
				partial: false,
			}

			await searchAndReplaceTool(
				mockTask,
				toolUse,
				mockAskApproval,
				mockHandleError,
				mockPushToolResult,
				mockRemoveClosingTag,
			)

			expect(mockTask.consecutiveMistakeCount).toBe(1)
			expect(mockTask.recordToolError).toHaveBeenCalledWith("search_and_replace")
			expect(mockPushToolResult).toHaveBeenCalledWith(
				expect.stringContaining("Search query matches 3 locations in the file"),
			)
			expect(mockPushToolResult).toHaveBeenCalledWith(
				expect.stringContaining("This could lead to unintended replacements"),
			)
		})

		it("should fail when search query matches multiple locations in line range", async () => {
			const fileContent = `function test() {
		  if (true) {
		      return true;
		  } else {
		      return false;
		  }
		  return null;
}`

			mockFs.readFile.mockResolvedValue(fileContent)

			const toolUse: ToolUse = {
				type: "tool_use",
				name: "search_and_replace",
				params: {
					path: "test.js",
					search: "}",
					replace: "} // modified",
					start_line: "3",
					end_line: "6",
				},
				partial: false,
			}

			await searchAndReplaceTool(
				mockTask,
				toolUse,
				mockAskApproval,
				mockHandleError,
				mockPushToolResult,
				mockRemoveClosingTag,
			)

			expect(mockTask.consecutiveMistakeCount).toBe(1)
			expect(mockTask.recordToolError).toHaveBeenCalledWith("search_and_replace")
			expect(mockPushToolResult).toHaveBeenCalledWith(
				expect.stringContaining("Search query matches 2 locations in the specified line range"),
			)
		})

		it("should succeed when search query matches exactly one location", async () => {
			const fileContent = `function test() {
    return "unique_string";
}`

			mockFs.readFile.mockResolvedValue(fileContent)
			mockTask.ask.mockResolvedValue({ response: "yesButtonClicked" })

			const toolUse: ToolUse = {
				type: "tool_use",
				name: "search_and_replace",
				params: {
					path: "test.js",
					search: "unique_string",
					replace: "modified_string",
				},
				partial: false,
			}

			await searchAndReplaceTool(
				mockTask,
				toolUse,
				mockAskApproval,
				mockHandleError,
				mockPushToolResult,
				mockRemoveClosingTag,
			)

			expect(mockTask.consecutiveMistakeCount).toBe(0)
			expect(mockTask.recordToolError).not.toHaveBeenCalled()
			expect(mockTask.recordToolUsage).toHaveBeenCalledWith("search_and_replace")
		})

		it("should succeed when search query matches no locations", async () => {
			const fileContent = `function test() {
    return true;
}`

			mockFs.readFile.mockResolvedValue(fileContent)

			const toolUse: ToolUse = {
				type: "tool_use",
				name: "search_and_replace",
				params: {
					path: "test.js",
					search: "nonexistent_string",
					replace: "replacement",
				},
				partial: false,
			}

			await searchAndReplaceTool(
				mockTask,
				toolUse,
				mockAskApproval,
				mockHandleError,
				mockPushToolResult,
				mockRemoveClosingTag,
			)

			expect(mockTask.consecutiveMistakeCount).toBe(0)
			expect(mockPushToolResult).toHaveBeenCalledWith("No changes needed for 'test.js'")
		})

		it("should handle regex patterns correctly", async () => {
			const fileContent = `const var1 = 1;
const var2 = 2;
const var3 = 3;`

			mockFs.readFile.mockResolvedValue(fileContent)

			const toolUse: ToolUse = {
				type: "tool_use",
				name: "search_and_replace",
				params: {
					path: "test.js",
					search: "var\\d+",
					replace: "variable",
					use_regex: "true",
				},
				partial: false,
			}

			await searchAndReplaceTool(
				mockTask,
				toolUse,
				mockAskApproval,
				mockHandleError,
				mockPushToolResult,
				mockRemoveClosingTag,
			)

			expect(mockTask.consecutiveMistakeCount).toBe(1)
			expect(mockPushToolResult).toHaveBeenCalledWith(
				expect.stringContaining("Search query matches 3 locations in the file"),
			)
		})

		it("should handle case-insensitive searches correctly", async () => {
			const fileContent = `const Test = 1;
const test = 2;
const TEST = 3;`

			mockFs.readFile.mockResolvedValue(fileContent)

			const toolUse: ToolUse = {
				type: "tool_use",
				name: "search_and_replace",
				params: {
					path: "test.js",
					search: "test",
					replace: "variable",
					ignore_case: "true",
				},
				partial: false,
			}

			await searchAndReplaceTool(
				mockTask,
				toolUse,
				mockAskApproval,
				mockHandleError,
				mockPushToolResult,
				mockRemoveClosingTag,
			)

			expect(mockTask.consecutiveMistakeCount).toBe(1)
			expect(mockPushToolResult).toHaveBeenCalledWith(
				expect.stringContaining("Search query matches 3 locations in the file"),
			)
		})

		it("should limit displayed matches to 10 in error message", async () => {
			// Create content with many matches
			const fileContent = Array.from({ length: 15 }, (_, i) => `line${i} {}`).join("\n")

			mockFs.readFile.mockResolvedValue(fileContent)

			const toolUse: ToolUse = {
				type: "tool_use",
				name: "search_and_replace",
				params: {
					path: "test.js",
					search: "}",
					replace: "} // modified",
				},
				partial: false,
			}

			await searchAndReplaceTool(
				mockTask,
				toolUse,
				mockAskApproval,
				mockHandleError,
				mockPushToolResult,
				mockRemoveClosingTag,
			)

			expect(mockPushToolResult).toHaveBeenCalledWith(expect.stringContaining("... and 5 more matches"))
		})
	})

	describe("error handling", () => {
		it("should handle missing path parameter", async () => {
			mockTask.sayAndCreateMissingParamError.mockResolvedValue("Missing path parameter")

			const toolUse: ToolUse = {
				type: "tool_use",
				name: "search_and_replace",
				params: {
					search: "test",
					replace: "replacement",
				},
				partial: false,
			}

			await searchAndReplaceTool(
				mockTask,
				toolUse,
				mockAskApproval,
				mockHandleError,
				mockPushToolResult,
				mockRemoveClosingTag,
			)

			expect(mockTask.consecutiveMistakeCount).toBe(1)
			expect(mockTask.recordToolError).toHaveBeenCalledWith("search_and_replace")
			expect(mockTask.sayAndCreateMissingParamError).toHaveBeenCalledWith("search_and_replace", "path")
		})

		it("should handle missing search parameter", async () => {
			mockTask.sayAndCreateMissingParamError.mockResolvedValue("Missing search parameter")

			const toolUse: ToolUse = {
				type: "tool_use",
				name: "search_and_replace",
				params: {
					path: "test.js",
					replace: "replacement",
				},
				partial: false,
			}

			await searchAndReplaceTool(
				mockTask,
				toolUse,
				mockAskApproval,
				mockHandleError,
				mockPushToolResult,
				mockRemoveClosingTag,
			)

			expect(mockTask.consecutiveMistakeCount).toBe(1)
			expect(mockTask.recordToolError).toHaveBeenCalledWith("search_and_replace")
			expect(mockTask.sayAndCreateMissingParamError).toHaveBeenCalledWith("search_and_replace", "search")
		})

		it("should handle missing replace parameter", async () => {
			mockTask.sayAndCreateMissingParamError.mockResolvedValue("Missing replace parameter")

			const toolUse: ToolUse = {
				type: "tool_use",
				name: "search_and_replace",
				params: {
					path: "test.js",
					search: "test",
				},
				partial: false,
			}

			await searchAndReplaceTool(
				mockTask,
				toolUse,
				mockAskApproval,
				mockHandleError,
				mockPushToolResult,
				mockRemoveClosingTag,
			)

			expect(mockTask.consecutiveMistakeCount).toBe(1)
			expect(mockTask.recordToolError).toHaveBeenCalledWith("search_and_replace")
			expect(mockTask.sayAndCreateMissingParamError).toHaveBeenCalledWith("search_and_replace", "replace")
		})
	})
})
