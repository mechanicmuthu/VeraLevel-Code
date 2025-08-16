import { describe, it, expect } from "vitest"
import { getToolDescriptionsForMode } from "../index"

describe("getToolDescriptionsForMode", () => {
	it("does not throw when customModes is filtered and mode slug exists only in provider state or built-ins", () => {
		// Use a known built-in mode slug
		const builtInModeSlug = "code"

		// Pass an explicitly empty customModes list to simulate filtered state
		expect(() =>
			getToolDescriptionsForMode(
				builtInModeSlug,
				"/tmp",
				false,
				undefined,
				undefined,
				undefined,
				undefined,
				[], // enabledCustomModes (empty)
				undefined,
				undefined,
				undefined,
			),
		).not.toThrow()
	})
})
