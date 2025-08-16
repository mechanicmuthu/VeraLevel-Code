import * as vscode from "vscode"
import { vi, describe, it, expect, beforeEach } from "vitest"

import { webviewMessageHandler } from "../webviewMessageHandler"

vi.mock("vscode", () => ({
	window: {
		showWarningMessage: vi.fn(),
		showErrorMessage: vi.fn(),
	},
	workspace: {
		workspaceFolders: [],
		createFileSystemWatcher: vi.fn(),
		onDidSaveTextDocument: vi.fn(),
	},
}))

// Minimal provider stub
class MockContextProxy {
	private store: Record<string, any> = {}
	getValue(key: string) {
		return this.store[key]
	}
	async setValue(key: string, value: any) {
		this.store[key] = value
	}
}

class MockProvider {
	contextProxy: MockContextProxy
	customModesManager: any
	postStateToWebview: any
	handleModeSwitch: any
	constructor() {
		this.contextProxy = new MockContextProxy()
		this.customModesManager = { getCustomModes: vi.fn().mockResolvedValue([]) }
		this.postStateToWebview = vi.fn()
		this.handleModeSwitch = vi.fn()
	}
}

describe("webviewMessageHandler updateEnabledModes", () => {
	it("prevents empty enabledModes and shows warning", async () => {
		const provider = new MockProvider()

		// customModesManager returns two modes
		provider.customModesManager.getCustomModes = vi.fn().mockResolvedValue([{ slug: "code" }, { slug: "chat" }])

		// initial enabledModes in store
		provider.contextProxy.setValue("enabledModes", ["code", "chat"])

		await webviewMessageHandler(provider as any, { type: "updateEnabledModes", enabledModes: [] } as any)

		expect(vscode.window.showWarningMessage).toHaveBeenCalled()
		expect(provider.postStateToWebview).toHaveBeenCalled()
	})

	it("reconciles incoming list and persists, auto-switches if current mode disabled", async () => {
		const provider = new MockProvider()

		provider.customModesManager.getCustomModes = vi.fn().mockResolvedValue([{ slug: "code" }, { slug: "chat" }])

		// initial mode is 'chat'
		provider.contextProxy.setValue("mode", "chat")
		provider.contextProxy.setValue("enabledModes", ["code", "chat"])

		await webviewMessageHandler(provider as any, { type: "updateEnabledModes", enabledModes: ["code"] } as any)

		// Should persist reconciled list
		expect(provider.contextProxy.getValue("enabledModes")).toEqual(["code"])

		// Since 'chat' was active and is now disabled, should call handleModeSwitch
		expect(provider.handleModeSwitch).toHaveBeenCalledWith("code")
	})
})
