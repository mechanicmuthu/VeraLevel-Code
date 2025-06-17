import { useCallback, useState } from "react"
import { Checkbox } from "vscrui"
import { VSCodeTextField, VSCodeButton } from "@vscode/webview-ui-toolkit/react"

import type { ProviderSettings } from "@roo-code/types"

import { useAppTranslation } from "@src/i18n/TranslationContext"
import { VSCodeButtonLink } from "@src/components/common/VSCodeButtonLink"
import { vscode } from "@src/utils/vscode"

import { inputEventTransform, noTransform } from "../transforms"

type AnthropicProps = {
	apiConfiguration: ProviderSettings
	setApiConfigurationField: (field: keyof ProviderSettings, value: ProviderSettings[keyof ProviderSettings]) => void
	uriScheme?: string
}

export const Anthropic = ({ apiConfiguration, setApiConfigurationField, uriScheme }: AnthropicProps) => {
	const { t } = useAppTranslation()

	const [anthropicBaseUrlSelected, setAnthropicBaseUrlSelected] = useState(!!apiConfiguration?.anthropicBaseUrl)

	const handleInputChange = useCallback(
		<K extends keyof ProviderSettings, E>(
			field: K,
			transform: (event: E) => ProviderSettings[K] = inputEventTransform,
		) =>
			(event: E | Event) => {
				setApiConfigurationField(field, transform(event as E))
			},
		[setApiConfigurationField],
	)

	const handleOAuthToggle = useCallback(
		(checked: boolean) => {
			setApiConfigurationField("anthropicUseOAuth", checked)
			if (checked) {
				// Clear API key when switching to OAuth
				setApiConfigurationField("apiKey", "")
			} else {
				// Clear OAuth connection when switching to API key
				setApiConfigurationField("anthropicOAuthConnected", false)
				setApiConfigurationField("anthropicOAuthAccessToken", "")
			}
		},
		[setApiConfigurationField],
	)

	const handleOAuthConnect = useCallback(() => {
		vscode.postMessage({
			type: "anthropicOAuthConnect",
			uriScheme: uriScheme,
		})
	}, [uriScheme])

	const handleOAuthDisconnect = useCallback(() => {
		vscode.postMessage({
			type: "anthropicOAuthDisconnect",
		})
	}, [])

	const isOAuthMode = apiConfiguration?.anthropicUseOAuth ?? false
	const isOAuthConnected = apiConfiguration?.anthropicOAuthConnected ?? false

	return (
		<>
			{/* Authentication Method Selection */}
			<div className="flex flex-col gap-3">
				<div>
					<label className="block font-medium mb-2">Authentication Method</label>
					<div className="flex flex-col gap-2">
						<Checkbox checked={!isOAuthMode} onChange={(checked: boolean) => handleOAuthToggle(!checked)}>
							Use API Key
						</Checkbox>
						<Checkbox checked={isOAuthMode} onChange={handleOAuthToggle}>
							Use Claude Pro/Max Account (OAuth)
						</Checkbox>
					</div>
				</div>

				{/* API Key Authentication */}
				{!isOAuthMode && (
					<>
						<VSCodeTextField
							value={apiConfiguration?.apiKey || ""}
							type="password"
							onInput={handleInputChange("apiKey")}
							placeholder={t("settings:placeholders.apiKey")}
							className="w-full">
							<label className="block font-medium mb-1">{t("settings:providers.anthropicApiKey")}</label>
						</VSCodeTextField>
						<div className="text-sm text-vscode-descriptionForeground -mt-2">
							{t("settings:providers.apiKeyStorageNotice")}
						</div>
						{!apiConfiguration?.apiKey && (
							<VSCodeButtonLink href="https://console.anthropic.com/settings/keys" appearance="secondary">
								{t("settings:providers.getAnthropicApiKey")}
							</VSCodeButtonLink>
						)}
					</>
				)}

				{/* OAuth Authentication */}
				{isOAuthMode && (
					<div className="flex flex-col gap-3">
						<div className="text-sm text-vscode-descriptionForeground">
							Connect your Claude Pro/Max account to use your subscription instead of paying per-token API
							pricing.
						</div>

						{!isOAuthConnected ? (
							<VSCodeButton onClick={handleOAuthConnect} style={{ width: "100%" }} appearance="primary">
								Connect Claude Pro/Max Account
							</VSCodeButton>
						) : (
							<div className="flex flex-col gap-2">
								<div className="flex items-center gap-2 text-sm text-green-600">
									<span>✓</span>
									<span>Connected to Claude Pro/Max</span>
								</div>
								<VSCodeButton
									onClick={handleOAuthDisconnect}
									style={{ width: "100%" }}
									appearance="secondary">
									Disconnect Account
								</VSCodeButton>
							</div>
						)}

						<div className="text-xs text-vscode-descriptionForeground">
							Your Claude subscription limits reset every 5 hours and provide generous usage allowances
							compared to API pricing.
						</div>
					</div>
				)}

				{/* Advanced Settings */}
				<div>
					<Checkbox
						checked={anthropicBaseUrlSelected}
						onChange={(checked: boolean) => {
							setAnthropicBaseUrlSelected(checked)

							if (!checked) {
								setApiConfigurationField("anthropicBaseUrl", "")
								setApiConfigurationField("anthropicUseAuthToken", false)
							}
						}}>
						{t("settings:providers.useCustomBaseUrl")}
					</Checkbox>
					{anthropicBaseUrlSelected && (
						<>
							<VSCodeTextField
								value={apiConfiguration?.anthropicBaseUrl || ""}
								type="url"
								onInput={handleInputChange("anthropicBaseUrl")}
								placeholder="https://api.anthropic.com"
								className="w-full mt-1"
							/>
							{!isOAuthMode && (
								<Checkbox
									checked={apiConfiguration?.anthropicUseAuthToken ?? false}
									onChange={handleInputChange("anthropicUseAuthToken", noTransform)}
									className="w-full mt-1">
									{t("settings:providers.anthropicUseAuthToken")}
								</Checkbox>
							)}
						</>
					)}
				</div>
			</div>
		</>
	)
}
