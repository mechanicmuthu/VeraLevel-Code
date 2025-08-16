import * as vscode from "vscode"
import type { ModeConfig, CustomModePrompts } from "@roo-code/types"

import { modes as builtinModes, defaultModeSlug, getAllModes } from "../shared/modes"
import { CustomModesManager } from "../core/config/CustomModesManager"

export type ModeSource = "builtin" | "global" | "project"

export interface ModeState {
	mode: ModeConfig
	isDisabled: boolean
}

/**
 * ModeManager handles mode operations including enable/disable functionality,
 * source identification, and mode filtering
 */
export class ModeManager {
	private customModesManager: CustomModesManager
	private context: vscode.ExtensionContext

	constructor(context: vscode.ExtensionContext, customModesManager: CustomModesManager) {
		this.context = context
		this.customModesManager = customModesManager
	}

	/**
	 * Get all modes with their sources (builtin, global, project)
	 */
	async getAllModesWithSource(): Promise<ModeConfig[]> {
		const customModes = await this.customModesManager.getCustomModes()
		const allModes: ModeConfig[] = []

		// Add built-in modes first
		for (const mode of builtinModes) {
			// Check if this built-in mode is overridden by custom modes
			const customOverride = customModes.find((m) => m.slug === mode.slug)
			if (!customOverride) {
				allModes.push({ ...mode, source: "builtin" })
			}
		}

		// Add custom modes (they override built-in modes and have source information)
		for (const mode of customModes) {
			allModes.push({
				...mode,
				source: mode.source || "global",
			})
		}

		return allModes
	}

	/**
	 * Get all enabled modes (excluding disabled ones)
	 */
	async getEnabledModes(): Promise<ModeConfig[]> {
		const allModes = await this.getAllModesWithSource()
		return allModes.filter((mode) => !mode.disabled)
	}

	/**
	 * Get all disabled modes
	 */
	async getDisabledModes(): Promise<ModeConfig[]> {
		const allModes = await this.getAllModesWithSource()
		return allModes.filter((mode) => mode.disabled === true)
	}

	/**
	 * Check if a mode is disabled
	 */
	async isModeDisabled(slug: string): Promise<boolean> {
		const allModes = await this.getAllModesWithSource()
		const mode = allModes.find((m) => m.slug === slug)
		return mode?.disabled === true
	}

	/**
	 * Enable or disable a mode
	 */
	async setModeDisabled(slug: string, disabled: boolean): Promise<void> {
		const allModes = await this.getAllModesWithSource()
		const mode = allModes.find((m) => m.slug === slug)

		if (!mode) {
			throw new Error(`Mode with slug '${slug}' not found`)
		}

		// For built-in modes, we need to create an override
		if (mode.source === "builtin") {
			// Create a global override for the built-in mode
			const builtinMode = builtinModes.find((m) => m.slug === slug)
			if (builtinMode) {
				const override: ModeConfig = {
					...builtinMode,
					source: "global",
					disabled: disabled,
				}
				await this.customModesManager.updateCustomMode(slug, override)
			}
		} else {
			// Update existing custom mode
			const updatedMode = { ...mode, disabled }
			await this.customModesManager.updateCustomMode(slug, updatedMode)
		}
	}

	/**
	 * Get mode by slug with source information
	 */
	async getModeBySlug(slug: string): Promise<ModeConfig | null> {
		const allModes = await this.getAllModesWithSource()
		return allModes.find((m) => m.slug === slug) || null
	}

	/**
	 * Get available mode slugs (enabled modes only)
	 */
	async getAvailableModeSlugs(): Promise<string[]> {
		const enabledModes = await this.getEnabledModes()
		return enabledModes.map((m) => m.slug)
	}

	/**
	 * Batch update mode disabled states
	 */
	async batchUpdateModeStates(updates: Record<string, boolean>): Promise<void> {
		const allModes = await this.getAllModesWithSource()

		for (const [slug, disabled] of Object.entries(updates)) {
			const mode = allModes.find((m) => m.slug === slug)
			if (mode) {
				await this.setModeDisabled(slug, disabled)
			}
		}
	}

	/**
	 * Get modes categorized by source
	 */
	async getModesBySource(): Promise<{
		builtin: ModeConfig[]
		global: ModeConfig[]
		project: ModeConfig[]
	}> {
		const allModes = await this.getAllModesWithSource()

		return {
			builtin: allModes.filter((m) => m.source === "builtin"),
			global: allModes.filter((m) => m.source === "global"),
			project: allModes.filter((m) => m.source === "project"),
		}
	}

	/**
	 * Get enabled modes for system prompt generation (excludes disabled modes)
	 */
	async getModesForSystemPrompt(customModePrompts?: CustomModePrompts): Promise<ModeConfig[]> {
		const enabledModes = await this.getEnabledModes()

		// Apply custom prompt overrides
		return enabledModes.map((mode) => ({
			...mode,
			roleDefinition: customModePrompts?.[mode.slug]?.roleDefinition ?? mode.roleDefinition,
			whenToUse: customModePrompts?.[mode.slug]?.whenToUse ?? mode.whenToUse,
			customInstructions: customModePrompts?.[mode.slug]?.customInstructions ?? mode.customInstructions,
			description: customModePrompts?.[mode.slug]?.description ?? mode.description,
		}))
	}

	/**
	 * Check if current mode is disabled and suggest enabled alternatives
	 */
	async validateModeSwitch(targetSlug: string): Promise<{
		isValid: boolean
		errorMessage?: string
		availableModes?: string[]
	}> {
		const mode = await this.getModeBySlug(targetSlug)

		if (!mode) {
			const availableModes = await this.getAvailableModeSlugs()
			return {
				isValid: false,
				errorMessage: `Mode '${targetSlug}' not found.`,
				availableModes,
			}
		}

		if (mode.disabled) {
			const availableModes = await this.getAvailableModeSlugs()
			return {
				isValid: false,
				errorMessage: `Mode '${targetSlug}' is currently disabled.`,
				availableModes,
			}
		}

		return { isValid: true }
	}
}
