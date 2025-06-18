import * as vscode from "vscode"
import { BrowserSession } from "../BrowserSession"
import { Browser } from "puppeteer-core"

// Mock vscode
jest.mock("vscode", () => ({
	ExtensionContext: jest.fn(),
}))

// Mock fs/promises
jest.mock("fs/promises", () => ({
	mkdir: jest.fn().mockResolvedValue(undefined),
}))

// Mock path
jest.mock("path", () => ({
	join: jest.fn((...args) => args.join("/")),
}))

// Mock puppeteer-core
jest.mock("puppeteer-core", () => ({
	launch: jest.fn(),
	connect: jest.fn(),
}))

// Mock puppeteer-chromium-resolver
jest.mock("puppeteer-chromium-resolver", () => {
	return jest.fn().mockResolvedValue({
		puppeteer: {
			launch: jest.fn(),
		},
		executablePath: "/mock/chrome/path",
	})
})

// Mock browserDiscovery
jest.mock("../browserDiscovery", () => ({
	discoverChromeHostUrl: jest.fn(),
	tryChromeHostUrl: jest.fn(),
}))

// Mock fs utilities
jest.mock("../../../utils/fs", () => ({
	fileExistsAtPath: jest.fn().mockResolvedValue(true),
}))

// Mock delay and p-wait-for
jest.mock("delay", () => jest.fn().mockResolvedValue(undefined))
jest.mock("p-wait-for", () => jest.fn().mockResolvedValue(undefined))

describe("BrowserSession", () => {
	let mockContext: Partial<vscode.ExtensionContext>
	let mockBrowser: Partial<Browser>
	let browserSession: BrowserSession
	let mockLaunch: jest.Mock
	let mockConnect: jest.Mock
	let mockDiscoverChromeHostUrl: jest.Mock
	let mockTryChromeHostUrl: jest.Mock
	let mockPCR: jest.Mock

	beforeEach(() => {
		// Get the mocked functions
		const puppeteerCore = require("puppeteer-core")
		mockLaunch = puppeteerCore.launch as jest.Mock
		mockConnect = puppeteerCore.connect as jest.Mock

		const browserDiscovery = require("../browserDiscovery")
		mockDiscoverChromeHostUrl = browserDiscovery.discoverChromeHostUrl as jest.Mock
		mockTryChromeHostUrl = browserDiscovery.tryChromeHostUrl as jest.Mock

		mockPCR = require("puppeteer-chromium-resolver") as jest.Mock

		// Reset all mocks
		jest.clearAllMocks()

		// Mock browser instance
		mockBrowser = {
			close: jest.fn().mockResolvedValue(undefined),
			disconnect: jest.fn().mockResolvedValue(undefined),
			newPage: jest.fn(),
			pages: jest.fn().mockResolvedValue([]),
		}

		// Mock vscode context
		mockContext = {
			globalState: {
				get: jest.fn(),
				update: jest.fn(),
			},
			globalStorageUri: {
				fsPath: "/mock/storage/path",
			},
		} as any

		// Setup PCR mock
		mockPCR.mockResolvedValue({
			puppeteer: {
				launch: mockLaunch,
			},
			executablePath: "/mock/chrome/path",
		})

		// Setup default mock returns
		mockLaunch.mockResolvedValue(mockBrowser)
		mockConnect.mockResolvedValue(mockBrowser)
		mockTryChromeHostUrl.mockResolvedValue(true)

		browserSession = new BrowserSession(mockContext as vscode.ExtensionContext)
	})

	describe("closeBrowser with remote browser fallback scenario", () => {
		it("should close local browser when remote browser is enabled but fallback to local was used", async () => {
			// Setup: Remote browser is enabled in settings
			;(mockContext.globalState!.get as jest.Mock).mockImplementation((key: string) => {
				if (key === "remoteBrowserEnabled") return true
				if (key === "browserViewportSize") return "900x600"
				return undefined
			})

			// Mock discoverChromeHostUrl to fail (no remote browser available)
			mockDiscoverChromeHostUrl.mockRejectedValue(new Error("No remote browser found"))

			// Launch browser - this should fallback to local browser
			await browserSession.launchBrowser()

			// Verify that launch was called (local browser)
			expect(mockLaunch).toHaveBeenCalled()

			// Now close the browser
			await browserSession.closeBrowser()

			// Verify that close() was called instead of disconnect()
			expect(mockBrowser.close).toHaveBeenCalled()
			expect(mockBrowser.disconnect).not.toHaveBeenCalled()
		})

		it("should disconnect from remote browser when actually connected to remote", async () => {
			// Setup: Remote browser is enabled in settings
			;(mockContext.globalState!.get as jest.Mock).mockImplementation((key: string) => {
				if (key === "remoteBrowserEnabled") return true
				if (key === "browserViewportSize") return "900x600"
				return undefined
			})

			// Mock discoverChromeHostUrl to succeed
			mockDiscoverChromeHostUrl.mockResolvedValue("ws://localhost:9222")

			// Launch browser - this should connect to remote browser
			await browserSession.launchBrowser()

			// Verify that connect was called (remote browser)
			expect(mockConnect).toHaveBeenCalled()

			// Now close the browser
			await browserSession.closeBrowser()

			// Verify that disconnect() was called instead of close()
			expect(mockBrowser.disconnect).toHaveBeenCalled()
			expect(mockBrowser.close).not.toHaveBeenCalled()
		})

		it("should close local browser when remote browser is disabled", async () => {
			// Setup: Remote browser is disabled in settings
			;(mockContext.globalState!.get as jest.Mock).mockImplementation((key: string) => {
				if (key === "remoteBrowserEnabled") return false
				if (key === "browserViewportSize") return "900x600"
				return undefined
			})

			// Launch browser - this should use local browser
			await browserSession.launchBrowser()

			// Verify that launch was called (local browser)
			expect(mockLaunch).toHaveBeenCalled()

			// Now close the browser
			await browserSession.closeBrowser()

			// Verify that close() was called
			expect(mockBrowser.close).toHaveBeenCalled()
			expect(mockBrowser.disconnect).not.toHaveBeenCalled()
		})
	})
})
