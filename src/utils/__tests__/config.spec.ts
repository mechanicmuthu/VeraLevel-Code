import { describe, it, expect, beforeEach, vi } from "vitest"
import * as vscode from "vscode"
import * as path from "path"
import * as os from "os"
import { injectVariables } from "../config"

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

describe("injectVariables", () => {
	beforeEach(() => {
		vi.clearAllMocks()

		// Setup workspace folder mock
		const mockWorkspaceFolder = {
			uri: { fsPath: "/test/workspace" },
		}
		;(vscode.workspace.getWorkspaceFolder as any).mockReturnValue(mockWorkspaceFolder)
	})

	it("should resolve workspaceFolder variable", async () => {
		const config = {
			command: "node",
			args: ["${workspaceFolder}/server.js"],
		}

		const result = await injectVariables(config, {})

		expect(result.args[0]).toBe("/test/workspace/server.js")
	})

	it("should resolve fileWorkspaceFolder variable", async () => {
		const config = {
			command: "node",
			args: ["${fileWorkspaceFolder}/server.js"],
		}

		const result = await injectVariables(config, {})

		expect(result.args[0]).toBe("/test/workspace/server.js")
	})

	it("should resolve workspaceFolderBasename variable", async () => {
		const config = {
			name: "${workspaceFolderBasename}-server",
		}

		const result = await injectVariables(config, {})

		expect(result.name).toBe("workspace-server")
	})

	it("should resolve userHome variable", async () => {
		const config = {
			path: "${userHome}/.config/app",
		}

		const result = await injectVariables(config, {})

		expect(result.path).toBe(`${os.homedir()}/.config/app`)
	})

	it("should resolve pathSeparator variable", async () => {
		const config = {
			path: "folder${pathSeparator}file.txt",
		}

		const result = await injectVariables(config, {})

		expect(result.path).toBe(`folder${path.sep}file.txt`)
	})

	it("should resolve file variables when active editor exists", async () => {
		const config = {
			file: "${file}",
			basename: "${fileBasename}",
			dirname: "${fileDirname}",
			extension: "${fileExtname}",
			basenameNoExt: "${fileBasenameNoExtension}",
		}

		const result = await injectVariables(config, {})

		expect(result.file).toBe("/test/workspace/src/test.ts")
		expect(result.basename).toBe("test.ts")
		expect(result.dirname).toBe("/test/workspace/src")
		expect(result.extension).toBe(".ts")
		expect(result.basenameNoExt).toBe("test")
	})

	it("should handle environment variables with env: prefix", async () => {
		const config = {
			path: "${env:HOME}/config",
		}

		const result = await injectVariables(config, {
			env: { HOME: "/home/user" },
		})

		expect(result.path).toBe("/home/user/config")
	})

	it("should prioritize custom variables over VS Code variables", async () => {
		const config = {
			path: "${workspaceFolder}/custom",
		}

		const result = await injectVariables(config, {
			workspaceFolder: "/custom/workspace",
		})

		expect(result.path).toBe("/custom/workspace/custom")
	})

	it("should handle multiple variables in the same string", async () => {
		const config = {
			command: "node",
			args: ["${workspaceFolder}/node_modules/.bin/server", "--config", "${userHome}/.config/app.json"],
		}

		const result = await injectVariables(config, {})

		expect(result.args[0]).toBe("/test/workspace/node_modules/.bin/server")
		expect(result.args[2]).toBe(`${os.homedir()}/.config/app.json`)
	})

	it("should handle nested object structures", async () => {
		const config = {
			server: {
				command: "node",
				args: ["${workspaceFolder}/server.js"],
				env: {
					CONFIG_PATH: "${userHome}/.config",
				},
			},
		}

		const result = await injectVariables(config, {})

		expect(result.server.args[0]).toBe("/test/workspace/server.js")
		expect(result.server.env.CONFIG_PATH).toBe(`${os.homedir()}/.config`)
	})

	it("should leave unresolved variables unchanged", async () => {
		const config = {
			path: "${unknownVariable}/file.txt",
		}

		const result = await injectVariables(config, {})

		expect(result.path).toBe("${unknownVariable}/file.txt")
	})

	it("should handle string configs", async () => {
		const config = "${workspaceFolder}/server.js"

		const result = await injectVariables(config, {})

		expect(result).toBe("/test/workspace/server.js")
	})
})
