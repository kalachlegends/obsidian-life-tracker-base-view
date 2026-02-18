import type { HCGatewayAPI } from '../api/HCGatewayAPI'
import { log } from '../../../utils'

export interface HCGatewayAuthState {
    isAuthenticated: boolean
    token: string | null
    refreshToken: string | null
    tokenExpiry: string | null
    lastError: string | null
}

/**
 * Authentication service for HCGateway.
 * Manages login, session restore, and token lifecycle.
 */
export class HCGatewayAuthService {
    private api: HCGatewayAPI
    private state: HCGatewayAuthState = {
        isAuthenticated: false,
        token: null,
        refreshToken: null,
        tokenExpiry: null,
        lastError: null
    }

    constructor(api: HCGatewayAPI) {
        this.api = api
    }

    getState(): HCGatewayAuthState {
        return { ...this.state }
    }

    isAuthenticated(): boolean {
        return this.state.isAuthenticated
    }

    /**
     * Login with username/password. Updates internal state and API client tokens.
     */
    async login(username: string, password: string): Promise<boolean> {
        try {
            const response = await this.api.login(username, password)
            this.state.token = response.token
            this.state.refreshToken = response.refresh
            this.state.tokenExpiry = response.expiry
            this.state.isAuthenticated = true
            this.state.lastError = null
            return true
        } catch (error) {
            this.state.lastError = error instanceof Error ? error.message : 'Unknown error'
            this.state.isAuthenticated = false
            log(`HCGateway login failed: ${this.state.lastError}`, 'error')
            return false
        }
    }

    /**
     * Restore a previous session from persisted tokens.
     */
    restoreSession(token: string, refreshToken: string, tokenExpiry: string): void {
        this.api.setToken(token)
        this.api.setRefreshToken(refreshToken)
        this.api.setTokenExpiry(tokenExpiry)
        this.state.token = token
        this.state.refreshToken = refreshToken
        this.state.tokenExpiry = tokenExpiry
        this.state.isAuthenticated = true
        this.state.lastError = null
    }

    /**
     * Clear all auth state and tokens.
     */
    clearSession(): void {
        this.api.setToken('')
        this.api.setRefreshToken('')
        this.api.setTokenExpiry('')
        this.state = {
            isAuthenticated: false,
            token: null,
            refreshToken: null,
            tokenExpiry: null,
            lastError: null
        }
    }

    /**
     * Validate the current token by attempting a lightweight fetch.
     * Returns true if the token is still valid.
     */
    async validateToken(): Promise<boolean> {
        if (!this.state.token) return false

        try {
            // Try fetching steps with an impossible date filter (should return empty array)
            await this.api.fetchData('steps', {
                start: { $gte: '9999-01-01T00:00:00' }
            })
            return true
        } catch (error) {
            log('HCGateway token validation failed', 'error', error)
            this.state.isAuthenticated = false
            this.state.lastError = 'Token expired or invalid'
            return false
        }
    }

    /**
     * Get auth data for persisting to settings (token + refresh + expiry).
     */
    getAuthData(): {
        token: string | null
        refreshToken: string | null
        tokenExpiry: string | null
    } {
        return {
            token: this.state.token,
            refreshToken: this.state.refreshToken,
            tokenExpiry: this.state.tokenExpiry
        }
    }
}
