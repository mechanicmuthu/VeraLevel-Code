import { useEffect, useMemo } from "react"
import { VSCodeDropdown, VSCodeOption } from "@vscode/webview-ui-toolkit/react"
import { useAppTranslation } from "@src/i18n/TranslationContext"
import type { ProviderSettings, ModelInfo } from "@roo-code/types"

type Props = {
	apiConfiguration: ProviderSettings
	setApiConfigurationField: (field: keyof ProviderSettings, value: any) => void
	modelInfo?: ModelInfo
	modelId?: string
}

// Models that currently have flex pricing
const FLEX_COMPATIBLE_MODELS = ["gpt-5", "gpt-5-mini", "gpt-5-nano", "o3", "o4-mini"]
const SERVICE_TIERS: Array<"auto" | "default" | "flex"> = ["auto", "default", "flex"]

export const ServiceTier = ({ apiConfiguration, setApiConfigurationField, modelId }: Props) => {
	const { t } = useAppTranslation()
	const effectiveModelId = modelId || apiConfiguration.openAiModelId || ""

	const isSupported = useMemo(
		() => !!effectiveModelId && FLEX_COMPATIBLE_MODELS.some((m) => effectiveModelId.includes(m)),
		[effectiveModelId],
	)

	// Initialize to auto when supported and unset; clear when unsupported
	useEffect(() => {
		if (isSupported && !apiConfiguration.serviceTier) {
			setApiConfigurationField("serviceTier", "auto")
		} else if (!isSupported && apiConfiguration.serviceTier) {
			setApiConfigurationField("serviceTier", undefined)
		}
	}, [isSupported, apiConfiguration.serviceTier, setApiConfigurationField])

	if (!isSupported) return null

	return (
		<div className="flex flex-col gap-1">
			<label className="block font-medium mb-1">{t("settings:providers.serviceTier.label")}</label>
			<VSCodeDropdown
				value={apiConfiguration.serviceTier || "auto"}
				onChange={(e: any) => setApiConfigurationField("serviceTier", e.target.value)}
				className="w-48">
				{SERVICE_TIERS.map((tier) => (
					<VSCodeOption key={tier} value={tier}>
						{t(`settings:providers.serviceTier.${tier}` as any)}
					</VSCodeOption>
				))}
			</VSCodeDropdown>
			<div className="text-sm text-vscode-descriptionForeground">
				{t("settings:providers.serviceTier.description", {
					defaultValue: "Select pricing tier. Flex uses discounted rates when available.",
				})}
			</div>
		</div>
	)
}

export default ServiceTier
