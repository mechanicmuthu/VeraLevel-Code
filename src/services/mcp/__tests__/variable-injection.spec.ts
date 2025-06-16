import { describe, it, expect, beforeEach, vi } from "vitest"
import * as vscode from "vscode"
import { injectVariables } from "../../../utils/config"

// Mock vscode module
vi.mock("vscode", () => ({
	workspace: {
		workspaceFolders: [
			{
				uri: {
					fsPath: "/test/workspace",
				},
			},
		],
		getWorkspaceFolder: vi.fn(),
	},
	window: {
		activeTextEditor: {
			document: {
				uri: {
					fsPath: "/test/workspace/src/test.ts",
				},
			},
		},
	},
}))

describe("MCP Variable Injection", () => {
	beforeEach(() => {
		vi.clearAllMocks()

		// Setup workspace folder mock
		const mockWorkspaceFolder = {
			uri: { fsPath: "/test/workspace" },
		}
		;(vscode.workspace.getWorkspaceFolder as any).mockReturnValue(mockWorkspaceFolder)
	})

	it("should resolve workspaceFolder in MCP server configuration", async () => {
		const mcpConfig = {
			type: "stdio",
			command: "node",
			args: ["${workspaceFolder}/mcp-server/index.js"],
			env: {
				CONFIG_PATH: "${workspaceFolder}/.config",
			},
		}

		const result = await injectVariables(mcpConfig, {
			env: process.env,
			workspaceFolder: vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? "",
		})

		expect(result.args[0]).toBe("/test/workspace/mcp-server/index.js")
		expect(result.env.CONFIG_PATH).toBe("/test/workspace/.config")
	})

	it("should resolve fileWorkspaceFolder in MCP server configuration", async () => {
		const mcpConfig = {
			type: "stdio",
			command: "node",
			args: ["${fileWorkspaceFolder}/server.js"],
		}

		const result = await injectVariables(mcpConfig, {
			env: process.env,
			workspaceFolder: vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? "",
		})

		expect(result.args[0]).toBe("/test/workspace/server.js")
	})

	it("should handle complex MCP configuration with multiple variables", async () => {
		const mcpConfig = {
			type: "stdio",
			command: "node",
			args: [
				"${workspaceFolder}/node_modules/.bin/mcp-server-git",
				"--repository",
				"${workspaceFolder}",
				"--config",
				"${userHome}/.gitconfig",
			],
			env: {
				GIT_DIR: "${workspaceFolder}/.git",
				HOME: "${userHome}",
			},
		}

		const result = await injectVariables(mcpConfig, {
			env: process.env,
			workspaceFolder: vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? "",
		})

		expect(result.args[0]).toBe("/test/workspace/node_modules/.bin/mcp-server-git")
		expect(result.args[2]).toBe("/test/workspace")
		expect(result.args[4]).toMatch(/\/.*\/.gitconfig$/) // Should contain userHome path
		expect(result.env.GIT_DIR).toBe("/test/workspace/.git")
		expect(result.env.HOME).toMatch(/\/.*/) // Should contain userHome path
	})

	it("should handle environment variables with env: prefix", async () => {
		const mcpConfig = {
			type: "stdio",
			command: "node",
			args: ["${workspaceFolder}/server.js"],
			env: {
				PATH: "${env:PATH}",
				NODE_ENV: "${env:NODE_ENV}",
			},
		}

		const result = await injectVariables(mcpConfig, {
			env: {
				PATH: "/usr/bin:/bin",
				NODE_ENV: "development",
			},
			workspaceFolder: vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? "",
		})

		expect(result.args[0]).toBe("/test/workspace/server.js")
		expect(result.env.PATH).toBe("/usr/bin:/bin")
		expect(result.env.NODE_ENV).toBe("development")
	})

	it("should leave unresolved variables unchanged", async () => {
		const mcpConfig = {
			type: "stdio",
			command: "node",
			args: ["${workspaceFolder}/server.js", "${unknownVariable}"],
		}

		const result = await injectVariables(mcpConfig, {
			env: process.env,
			workspaceFolder: vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? "",
		})

		expect(result.args[0]).toBe("/test/workspace/server.js")
		expect(result.args[1]).toBe("${unknownVariable}")
	})

	it("should handle the exact scenario from the GitHub issue", async () => {
		// This is the exact configuration that was failing in the issue
		const mcpConfig = {
			type: "stdio",
			command: "node",
			args: ["${workspaceFolder}/mcp-server-git/index.js"],
		}

		const result = await injectVariables(mcpConfig, {
			env: process.env,
			workspaceFolder: vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? "",
		})

		// This should now work instead of causing "Invalid MCP settings JSON format"
		expect(result.args[0]).toBe("/test/workspace/mcp-server-git/index.js")
		expect(result.type).toBe("stdio")
		expect(result.command).toBe("node")
	})
})
