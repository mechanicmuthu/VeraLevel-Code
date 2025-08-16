import type { Mock } from "vitest"
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest"

import * as path from "path"
import * as fs from "fs/promises"

import * as yaml from "yaml"
import * as vscode from "vscode"

import type { ModeConfig } from "@roo-code/types"

import { fileExistsAtPath } from "../../../utils/fs"
import { getWorkspacePath } from "../../../utils/path"
import { GlobalFileNames } from "../../../shared/globalFileNames"

import { CustomModesManager } from "../CustomModesManager"

vi.mock("vscode", () => ({
	workspace: {
		workspaceFolders: [],
		onDidSaveTextDocument: vi.fn(),
		createFileSystemWatcher: vi.fn(),
	},
	window: {
		showErrorMessage: vi.fn(),
		showWarningMessage: vi.fn(),
	},
}))

vi.mock("fs/promises", () => ({
	mkdir: vi.fn(),
	readFile: vi.fn(),
	writeFile: vi.fn(),
	stat: vi.fn(),
	readdir: vi.fn(),
	rm: vi.fn(),
}))

vi.mock("../../../utils/fs")
vi.mock("../../../utils/path")

describe("CustomModesManager.getEnabledModes", () => {
	let manager: CustomModesManager
	let mockContext: vscode.ExtensionContext
	let mockOnUpdate: Mock

	const mockStoragePath = `${path.sep}mock${path.sep}settings`
	const mockSettingsPath = path.join(mockStoragePath, "settings", GlobalFileNames.customModes)
	const mockWorkspacePath = path.resolve("/mock/workspace")
	const mockRoomodes = path.join(mockWorkspacePath, ".roomodes")

	beforeEach(() => {
		mockOnUpdate = vi.fn()
		mockContext = {
			globalState: {
				get: vi.fn(),
				update: vi.fn(),
				keys: vi.fn(() => []),
				setKeysForSync: vi.fn(),
			},
			globalStorageUri: {
				fsPath: mockStoragePath,
			},
		} as unknown as vscode.ExtensionContext
		;(getWorkspacePath as Mock).mockReturnValue(mockWorkspacePath)
		;(fileExistsAtPath as Mock).mockImplementation(async (path: string) => {
			return path === mockSettingsPath || path === mockRoomodes
		})
		;(fs.mkdir as Mock).mockResolvedValue(undefined)
		;(fs.writeFile as Mock).mockResolvedValue(undefined)
		;(fs.stat as Mock).mockResolvedValue({ isDirectory: () => true })
		;(fs.readdir as Mock).mockResolvedValue([])
		;(fs.rm as Mock).mockResolvedValue(undefined)
		;(fs.readFile as Mock).mockImplementation(async (path: string) => {
			if (path === mockSettingsPath) {
				return yaml.stringify({ customModes: [] })
			}

			throw new Error("File not found")
		})

		manager = new CustomModesManager(mockContext, mockOnUpdate)
	})

	afterEach(() => {
		vi.clearAllMocks()
	})

	it("returns all mode slugs when persisted enabledModes is undefined", async () => {
		const customModes: ModeConfig[] = [
			{ slug: "code", name: "Code", roleDefinition: "r", groups: ["read"], source: "global" },
			{ slug: "chat", name: "Chat", roleDefinition: "r", groups: ["read"], source: "global" },
		]

		;(fs.readFile as Mock).mockImplementation(async (path: string) => {
			if (path === mockSettingsPath) {
				return yaml.stringify({ customModes })
			}
			throw new Error("File not found")
		})

		// Simulate no persisted enabledModes
		;(mockContext.globalState.get as Mock).mockReturnValue(undefined)

		const enabled = await manager.getEnabledModes()

		expect(enabled).toEqual(["code", "chat"])
	})

	it("reconciles persisted enabledModes against available modes", async () => {
		const customModes: ModeConfig[] = [
			{ slug: "code", name: "Code", roleDefinition: "r", groups: ["read"], source: "global" },
			{ slug: "chat", name: "Chat", roleDefinition: "r", groups: ["read"], source: "global" },
		]

		;(fs.readFile as Mock).mockImplementation(async (path: string) => {
			if (path === mockSettingsPath) {
				return yaml.stringify({ customModes })
			}
			throw new Error("File not found")
		})

		// persisted list contains an unknown slug "unknown" which should be filtered out
		;(mockContext.globalState.get as Mock).mockReturnValue(["chat", "unknown"])

		const enabled = await manager.getEnabledModes()

		expect(enabled).toEqual(["chat"])
	})
})
