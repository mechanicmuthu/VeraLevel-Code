import React, { useState, useEffect } from "react"
import { Check, X, Eye, EyeOff, HelpCircle } from "lucide-react"
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	Button,
	Checkbox,
	Badge,
	Separator,
	StandardTooltip,
	AlertDialog,
	AlertDialogContent,
	AlertDialogHeader,
	AlertDialogTitle,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogCancel,
	AlertDialogAction,
} from "@src/components/ui"
import { cn } from "@/lib/utils"
import type { ModeConfig } from "@roo-code/types"
import { useAppTranslation } from "@src/i18n/TranslationContext"

const SOURCE_INFO = {
	builtin: {
		label: "Built-in Modes",
		description: "Core modes provided by Roo Code",
		icon: "🏠",
		color: "builtin",
	},
	global: {
		label: "Global Modes",
		description: "Custom modes available across all workspaces",
		icon: "🌐",
		color: "global",
	},
	project: {
		label: "Project Modes",
		description: "Custom modes specific to this workspace",
		icon: "📁",
		color: "project",
	},
} as const

export type ModeSource = "builtin" | "global" | "project"

export interface ModeWithSource extends ModeConfig {
	source: ModeSource
	disabled?: boolean
}

interface ModeEnableDisableDialogProps {
	open: boolean
	onOpenChange: (open: boolean) => void
	modes: ModeWithSource[]
	onSave: (updatedModes: ModeWithSource[]) => void
}

interface DeleteState {
	open: boolean
	tMode?: { slug: string; name: string; source?: string; rulesFolderPath?: string } | null
}

interface GroupedModes {
	builtin: ModeWithSource[]
	global: ModeWithSource[]
	project: ModeWithSource[]
}

// const SOURCE_INFO = {
// 	builtin: {
// 		label: "Built-in Modes",
// 		description: "Core modes provided by Roo Code",
// 		icon: "🏠",
// 		color: "bg-blue-100 text-blue-800 border-blue-200",
// 	},
// 	global: {
// 		label: "Global Modes",
// 		description: "Custom modes available across all workspaces",
// 		icon: "🌐",
// 		color: "bg-green-100 text-green-800 border-green-200",
// 	},
// 	project: {
// 		label: "Project Modes",
// 		description: "Modes specific to this workspace",
// 		icon: "📁",
// 		color: "bg-purple-100 text-purple-800 border-purple-200",
// 	},
// } as const

export const ModeEnableDisableDialog: React.FC<ModeEnableDisableDialogProps> = ({
	open,
	onOpenChange,
	modes,
	onSave,
}) => {
	const [localModes, setLocalModes] = useState<ModeWithSource[]>(modes)
	const [hasChanges, setHasChanges] = useState(false)

	const { t } = useAppTranslation()

	const [deleteState, setDeleteState] = useState<DeleteState>({ open: false, tMode: null })

	// Update local state when props change
	useEffect(() => {
		setLocalModes(modes)
		setHasChanges(false)
	}, [modes])

	// Group modes by source
	const groupedModes: GroupedModes = React.useMemo(() => {
		return localModes.reduce(
			(acc, mode) => {
				acc[mode.source].push(mode)
				return acc
			},
			{ builtin: [], global: [], project: [] } as GroupedModes,
		)
	}, [localModes])

	// Calculate statistics
	const stats = React.useMemo(() => {
		const total = localModes.length
		const enabled = localModes.filter((m) => !m.disabled).length
		const disabled = total - enabled

		return { total, enabled, disabled }
	}, [localModes])

	// Toggle a single mode's disabled state
	const toggleMode = (slug: string) => {
		setLocalModes((prev) => {
			const updated = prev.map((mode) => (mode.slug === slug ? { ...mode, disabled: !mode.disabled } : mode))
			return updated
		})
		setHasChanges(true)
	}

	// Toggle all modes in a source group
	const toggleSourceGroup = (source: ModeSource, enable: boolean) => {
		setLocalModes((prev) => {
			const updated = prev.map((mode) => (mode.source === source ? { ...mode, disabled: !enable } : mode))
			return updated
		})
		setHasChanges(true)
	}

	// Enable/disable all modes
	const toggleAllModes = (enable: boolean) => {
		setLocalModes((prev) => {
			const updated = prev.map((mode) => ({ ...mode, disabled: !enable }))
			return updated
		})
		setHasChanges(true)
	}

	// Handle save
	const handleSave = () => {
		onSave(localModes)
		setHasChanges(false)
		onOpenChange(false)
	}

	// Handle cancel
	const handleCancel = () => {
		setLocalModes(modes) // Reset to original state
		setHasChanges(false)
		onOpenChange(false)
	}

	// Mode item component
	const ModeItem: React.FC<{ mode: ModeWithSource }> = ({ mode }) => (
		<div
			className={cn(
				"mode-item flex items-center justify-between p-3 rounded-lg border transition-all",
				mode.disabled && "disabled",
			)}>
			<div className="flex items-center gap-3 flex-1 min-w-0">
				<Checkbox
					checked={!mode.disabled}
					onCheckedChange={() => toggleMode(mode.slug)}
					className="flex-shrink-0"
				/>
				<div className="flex-1 min-w-0">
					<div className="flex items-center gap-2">
						<span className={cn("mode-name text-sm", mode.disabled && "disabled")}>{mode.name}</span>
						<Badge variant="outline" className={cn("source-badge text-xs px-1.5 py-0.5", mode.source)}>
							{SOURCE_INFO[mode.source].icon} {mode.source}
						</Badge>
					</div>
					{mode.description && (
						<p className={cn("mode-description text-xs mt-1 truncate", mode.disabled && "disabled")}>
							{mode.description}
						</p>
					)}
					<div className="mode-slug text-xs mt-0.5">slug: {mode.slug}</div>
				</div>
			</div>
			<div className="status-indicator flex items-center gap-1 flex-shrink-0">
				{mode.disabled ? <EyeOff className="size-4 disabled" /> : <Eye className="size-4 enabled" />}
				{/* Show delete for global custom modes (they override built-in or are user-created) */}
				{mode.source === "global" && (
					<Button
						variant="ghost"
						size="icon"
						onClick={() => {
							// Ask the extension to check for rules folder and return path via message
							setDeleteState({
								open: false,
								tMode: { slug: mode.slug, name: mode.name, source: mode.source },
							})
							// Request checkOnly first
							window.parent.postMessage(
								{ type: "deleteCustomMode", slug: mode.slug, checkOnly: true },
								"*",
							)
						}}>
						<span className="codicon codicon-trash"></span>
					</Button>
				)}
			</div>
		</div>
	)

	// Listen for delete check responses from extension
	useEffect(() => {
		const handler = (e: MessageEvent) => {
			const message = e.data
			if (message.type === "deleteCustomModeCheck") {
				if (message.slug && deleteState.tMode && deleteState.tMode.slug === message.slug) {
					setDeleteState({
						open: true,
						tMode: { ...deleteState.tMode, rulesFolderPath: message.rulesFolderPath },
					})
				}
			}
		}
		window.addEventListener("message", handler)
		return () => window.removeEventListener("message", handler)
	}, [deleteState.tMode])

	const confirmDelete = () => {
		if (!deleteState.tMode) return
		window.parent.postMessage({ type: "deleteCustomMode", slug: deleteState.tMode.slug }, "*")
		setDeleteState({ open: false, tMode: null })
		// Close dialog after request; backend will refresh state
		onOpenChange(false)
	}

	// Source group component
	const SourceGroup: React.FC<{ source: ModeSource; modes: ModeWithSource[] }> = ({ source, modes }) => {
		const sourceInfo = SOURCE_INFO[source]
		const enabled = modes.filter((m) => !m.disabled).length
		const total = modes.length
		const allEnabled = enabled === total
		const noneEnabled = enabled === 0

		if (modes.length === 0) return null

		return (
			<div className="space-y-3">
				<div className="flex items-center justify-between">
					<div className="flex items-center gap-2">
						<h4 className="text-sm font-semibold text-gray-900">
							{sourceInfo.icon} {sourceInfo.label}
						</h4>
						<StandardTooltip content={sourceInfo.description}>
							<HelpCircle className="size-3 text-gray-400 cursor-help" />
						</StandardTooltip>
						<Badge variant="outline" className="text-xs">
							{enabled}/{total} enabled
						</Badge>
					</div>
					<div className="flex items-center gap-1">
						<Button
							variant="outline"
							size="sm"
							onClick={() => toggleSourceGroup(source, true)}
							disabled={allEnabled}
							className="enable-disable-button text-xs h-7 px-2">
							Enable All
						</Button>
						<Button
							variant="outline"
							size="sm"
							onClick={() => toggleSourceGroup(source, false)}
							disabled={noneEnabled}
							className="enable-disable-button text-xs h-7 px-2">
							Disable All
						</Button>
					</div>
				</div>
				<div className="space-y-2">
					{modes.map((mode) => (
						<ModeItem key={mode.slug} mode={mode} />
					))}
				</div>
			</div>
		)
	}

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="max-w-4xl max-h-[80vh] overflow-hidden flex flex-col">
				<DialogHeader>
					<DialogTitle className="flex items-center gap-2">
						<Eye className="size-5" />
						Enable/Disable Modes
					</DialogTitle>
					<DialogDescription>
						Control which modes are available for use. Disabled modes will not appear in the mode selector
						and will be excluded from system prompts to reduce token usage.
					</DialogDescription>
				</DialogHeader>

				{/* Statistics and bulk actions */}
				<div className="flex items-center justify-between py-3 px-4 bg-gray-50 rounded-lg">
					<div className="flex items-center gap-4 text-sm">
						<span className="text-gray-700">
							<strong>{stats.total}</strong> total modes
						</span>
						<span className="text-green-700">
							<strong>{stats.enabled}</strong> enabled
						</span>
						<span className="text-red-700">
							<strong>{stats.disabled}</strong> disabled
						</span>
					</div>
					<div className="flex items-center gap-2">
						<Button
							variant="outline"
							size="sm"
							onClick={() => toggleAllModes(true)}
							disabled={stats.enabled === stats.total}
							className="enable-disable-button text-xs">
							<Check className="size-3 mr-1" />
							Enable All
						</Button>
						<Button
							variant="outline"
							size="sm"
							onClick={() => toggleAllModes(false)}
							disabled={stats.disabled === stats.total}
							className="enable-disable-button text-xs">
							<X className="size-3 mr-1" />
							Disable All
						</Button>
					</div>
				</div>

				{/* Scrollable content */}
				<div className="flex-1 overflow-y-auto space-y-6">
					<SourceGroup source="builtin" modes={groupedModes.builtin} />
					{groupedModes.global.length > 0 && (
						<>
							<Separator />
							<SourceGroup source="global" modes={groupedModes.global} />
						</>
					)}
					{groupedModes.project.length > 0 && (
						<>
							<Separator />
							<SourceGroup source="project" modes={groupedModes.project} />
						</>
					)}
				</div>

				<DialogFooter className="flex items-center justify-between">
					<div className="text-xs text-gray-500">{hasChanges && "You have unsaved changes"}</div>
					<div className="flex items-center gap-2">
						<Button variant="outline" onClick={handleCancel}>
							Cancel
						</Button>
						<Button onClick={handleSave} disabled={!hasChanges}>
							Save Changes
						</Button>
					</div>
				</DialogFooter>

				{/* Delete confirmation dialog for global custom modes */}
				<AlertDialog open={!!deleteState.open} onOpenChange={(open) => setDeleteState((s) => ({ ...s, open }))}>
					<AlertDialogContent>
						<AlertDialogHeader>
							<AlertDialogTitle>{t ? t("prompts:deleteMode.title") : "Delete mode"}</AlertDialogTitle>
							<AlertDialogDescription>
								{deleteState.tMode && (
									<>
										{t
											? t("prompts:deleteMode.message", { modeName: deleteState.tMode.name })
											: `Delete ${deleteState.tMode.name}?`}
										{deleteState.tMode.rulesFolderPath && (
											<div className="mt-2">
												{t
													? t("prompts:deleteMode.rulesFolder", {
															folderPath: deleteState.tMode.rulesFolderPath,
														})
													: deleteState.tMode.rulesFolderPath}
											</div>
										)}
									</>
								)}
							</AlertDialogDescription>
						</AlertDialogHeader>
						<AlertDialogFooter>
							<AlertDialogCancel>{t ? t("prompts:deleteMode.cancel") : "Cancel"}</AlertDialogCancel>
							<AlertDialogAction onClick={confirmDelete}>
								{t ? t("prompts:deleteMode.confirm") : "Delete"}
							</AlertDialogAction>
						</AlertDialogFooter>
					</AlertDialogContent>
				</AlertDialog>
			</DialogContent>
		</Dialog>
	)
}
