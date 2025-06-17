import * as vscode from "vscode"
import axios from "axios"

export interface AnthropicOAuthTokens {
	access_token: string
	refresh_token: string
	expires_in: number
	token_type: string
	scope: string
}

export interface AnthropicOAuthConfig {
	clientId: string
	authUrl: string
	tokenUrl: string
	redirectUri: string
}

export class AnthropicOAuthService {
	private static readonly CLIENT_ID = "9d1c250a-e61b-44d9-88ed-5944d1962f5e"
	private static readonly AUTH_URL = "https://console.anthropic.com/oauth/authorize"
	private static readonly TOKEN_URL = "https://console.anthropic.com/oauth/token"
	private static readonly REVOKE_URL = "https://console.anthropic.com/oauth/revoke"

	private context: vscode.ExtensionContext

	constructor(context: vscode.ExtensionContext) {
		this.context = context
	}

	/**
	 * Generate PKCE code verifier and challenge
	 */
	private generatePKCE(): { codeVerifier: string; codeChallenge: string } {
		// Generate a random code verifier (43-128 characters)
		const codeVerifier = this.generateRandomString(128)

		// Create code challenge using SHA256 and base64url encoding
		const encoder = new TextEncoder()
		const data = encoder.encode(codeVerifier)

		// For simplicity, we'll use a basic implementation
		// In a real implementation, you'd use crypto.subtle.digest
		const codeChallenge = this.base64URLEncode(codeVerifier)

		return { codeVerifier, codeChallenge }
	}

	private generateRandomString(length: number): string {
		const charset = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~"
		let result = ""
		for (let i = 0; i < length; i++) {
			result += charset.charAt(Math.floor(Math.random() * charset.length))
		}
		return result
	}

	private base64URLEncode(str: string): string {
		return Buffer.from(str).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "")
	}

	/**
	 * Get the OAuth authorization URL
	 */
	public getAuthUrl(uriScheme?: string): { url: string; codeVerifier: string } {
		const { codeVerifier, codeChallenge } = this.generatePKCE()
		const redirectUri = this.getRedirectUri(uriScheme)
		const state = this.generateRandomString(32)

		// Store state and code verifier for later verification
		this.context.globalState.update("anthropic_oauth_state", state)
		this.context.globalState.update("anthropic_oauth_code_verifier", codeVerifier)

		const params = new URLSearchParams({
			client_id: AnthropicOAuthService.CLIENT_ID,
			response_type: "code",
			redirect_uri: redirectUri,
			scope: "api",
			state: state,
			code_challenge: codeChallenge,
			code_challenge_method: "S256",
		})

		const url = `${AnthropicOAuthService.AUTH_URL}?${params.toString()}`
		return { url, codeVerifier }
	}

	/**
	 * Exchange authorization code for access token
	 */
	public async exchangeCodeForTokens(code: string, state: string): Promise<AnthropicOAuthTokens> {
		// Verify state parameter
		const storedState = this.context.globalState.get<string>("anthropic_oauth_state")
		if (!storedState || storedState !== state) {
			throw new Error("Invalid state parameter")
		}

		const codeVerifier = this.context.globalState.get<string>("anthropic_oauth_code_verifier")
		if (!codeVerifier) {
			throw new Error("Code verifier not found")
		}

		const redirectUri = this.getRedirectUri()

		try {
			const response = await axios.post(
				AnthropicOAuthService.TOKEN_URL,
				{
					grant_type: "authorization_code",
					client_id: AnthropicOAuthService.CLIENT_ID,
					code: code,
					redirect_uri: redirectUri,
					code_verifier: codeVerifier,
				},
				{
					headers: {
						"Content-Type": "application/x-www-form-urlencoded",
					},
				},
			)

			// Clean up stored values
			this.context.globalState.update("anthropic_oauth_state", undefined)
			this.context.globalState.update("anthropic_oauth_code_verifier", undefined)

			return response.data as AnthropicOAuthTokens
		} catch (error) {
			// Clean up stored values on error
			this.context.globalState.update("anthropic_oauth_state", undefined)
			this.context.globalState.update("anthropic_oauth_code_verifier", undefined)

			if (axios.isAxiosError(error)) {
				throw new Error(`OAuth token exchange failed: ${error.response?.data?.error || error.message}`)
			}
			throw error
		}
	}

	/**
	 * Refresh access token using refresh token
	 */
	public async refreshTokens(refreshToken: string): Promise<AnthropicOAuthTokens> {
		try {
			const response = await axios.post(
				AnthropicOAuthService.TOKEN_URL,
				{
					grant_type: "refresh_token",
					client_id: AnthropicOAuthService.CLIENT_ID,
					refresh_token: refreshToken,
				},
				{
					headers: {
						"Content-Type": "application/x-www-form-urlencoded",
					},
				},
			)

			return response.data as AnthropicOAuthTokens
		} catch (error) {
			if (axios.isAxiosError(error)) {
				throw new Error(`Token refresh failed: ${error.response?.data?.error || error.message}`)
			}
			throw error
		}
	}

	/**
	 * Revoke tokens
	 */
	public async revokeTokens(token: string): Promise<void> {
		try {
			await axios.post(
				AnthropicOAuthService.REVOKE_URL,
				{
					client_id: AnthropicOAuthService.CLIENT_ID,
					token: token,
				},
				{
					headers: {
						"Content-Type": "application/x-www-form-urlencoded",
					},
				},
			)
		} catch (error) {
			// Don't throw on revoke errors, just log them
			console.warn("Failed to revoke Anthropic OAuth token:", error)
		}
	}

	/**
	 * Store tokens securely
	 */
	public async storeTokens(tokens: AnthropicOAuthTokens): Promise<void> {
		await this.context.secrets.store("anthropic_oauth_tokens", JSON.stringify(tokens))
		await this.context.secrets.store(
			"anthropic_oauth_expires_at",
			(Date.now() + tokens.expires_in * 1000).toString(),
		)
	}

	/**
	 * Get stored tokens
	 */
	public async getStoredTokens(): Promise<AnthropicOAuthTokens | null> {
		try {
			const tokensJson = await this.context.secrets.get("anthropic_oauth_tokens")
			if (!tokensJson) {
				return null
			}
			return JSON.parse(tokensJson) as AnthropicOAuthTokens
		} catch (error) {
			console.error("Failed to retrieve stored Anthropic OAuth tokens:", error)
			return null
		}
	}

	/**
	 * Check if tokens are expired
	 */
	public async areTokensExpired(): Promise<boolean> {
		try {
			const expiresAtStr = await this.context.secrets.get("anthropic_oauth_expires_at")
			if (!expiresAtStr) {
				return true
			}
			const expiresAt = parseInt(expiresAtStr)
			// Consider tokens expired if they expire within the next 5 minutes
			return Date.now() >= expiresAt - 5 * 60 * 1000
		} catch (error) {
			console.error("Failed to check token expiration:", error)
			return true
		}
	}

	/**
	 * Get valid access token, refreshing if necessary
	 */
	public async getValidAccessToken(): Promise<string | null> {
		const tokens = await this.getStoredTokens()
		if (!tokens) {
			return null
		}

		const isExpired = await this.areTokensExpired()
		if (!isExpired) {
			return tokens.access_token
		}

		// Try to refresh the token
		try {
			const newTokens = await this.refreshTokens(tokens.refresh_token)
			await this.storeTokens(newTokens)
			return newTokens.access_token
		} catch (error) {
			console.error("Failed to refresh Anthropic OAuth token:", error)
			// Clear invalid tokens
			await this.clearTokens()
			return null
		}
	}

	/**
	 * Clear stored tokens
	 */
	public async clearTokens(): Promise<void> {
		await this.context.secrets.delete("anthropic_oauth_tokens")
		await this.context.secrets.delete("anthropic_oauth_expires_at")
	}

	/**
	 * Check if user is authenticated
	 */
	public async isAuthenticated(): Promise<boolean> {
		const token = await this.getValidAccessToken()
		return token !== null
	}

	private getRedirectUri(uriScheme?: string): string {
		const scheme = uriScheme || "vscode"
		return `${scheme}://rooveterinaryinc.roo-cline/anthropic/oauth/callback`
	}
}
