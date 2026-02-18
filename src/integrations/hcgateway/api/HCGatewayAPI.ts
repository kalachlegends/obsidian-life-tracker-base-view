import { requestUrl } from 'obsidian'
import type { HCGatewayAuthResponse, HCGatewayRecord, HCGatewayDataType } from '../types'
import { log } from '../../../utils'

/**
 * Low-level HTTP client for the HCGateway REST API.
 * Handles authentication, token refresh, and data fetching.
 */
export class HCGatewayAPI {
    private baseUrl: string
    private token: string
    private refreshToken: string
    private tokenExpiry: string

    constructor(baseUrl: string = 'http://localhost:6644', token: string = '') {
        this.baseUrl = baseUrl.replace(/\/$/, '')
        this.token = token
        this.refreshToken = ''
        this.tokenExpiry = ''
    }

    // ---- Getters / Setters ----

    setToken(token: string): void {
        this.token = token
    }

    getToken(): string {
        return this.token
    }

    setRefreshToken(refreshToken: string): void {
        this.refreshToken = refreshToken
    }

    getRefreshToken(): string {
        return this.refreshToken
    }

    setTokenExpiry(expiry: string): void {
        this.tokenExpiry = expiry
    }

    getTokenExpiry(): string {
        return this.tokenExpiry
    }

    setBaseUrl(baseUrl: string): void {
        this.baseUrl = baseUrl.replace(/\/$/, '')
    }

    // ---- Authentication ----

    /**
     * Login or register a user. Returns auth tokens.
     */
    async login(username: string, password: string): Promise<HCGatewayAuthResponse> {
        const url = `${this.baseUrl}/api/v2/login`

        const response = await requestUrl({
            url,
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        })

        if (response.status !== 200 && response.status !== 201) {
            const errorBody = response.json as Record<string, unknown> | undefined
            const errorMsg = errorBody?.['error'] ?? `HTTP ${response.status}`
            throw new Error(`HCGateway login failed: ${String(errorMsg)}`)
        }

        const data = response.json as HCGatewayAuthResponse
        this.token = data.token
        this.refreshToken = data.refresh
        this.tokenExpiry = data.expiry

        return data
    }

    /**
     * Refresh the bearer token using the stored refresh token.
     */
    async refresh(): Promise<HCGatewayAuthResponse> {
        if (!this.refreshToken) {
            throw new Error('No refresh token available')
        }

        const url = `${this.baseUrl}/api/v2/refresh`

        const response = await requestUrl({
            url,
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ refresh: this.refreshToken })
        })

        if (response.status !== 200) {
            const errorBody = response.json as Record<string, unknown> | undefined
            const errorMsg = errorBody?.['error'] ?? `HTTP ${response.status}`
            throw new Error(`HCGateway token refresh failed: ${String(errorMsg)}`)
        }

        const data = response.json as HCGatewayAuthResponse
        this.token = data.token
        this.refreshToken = data.refresh
        this.tokenExpiry = data.expiry

        return data
    }

    /**
     * Revoke the current token.
     */
    async revoke(): Promise<void> {
        if (!this.token) return

        const url = `${this.baseUrl}/api/v2/revoke`

        await requestUrl({
            url,
            method: 'DELETE',
            headers: this.createAuthHeaders(),
            throw: false
        })

        this.token = ''
        this.refreshToken = ''
        this.tokenExpiry = ''
    }

    // ---- Data Fetching ----

    /**
     * Fetch health data records for a specific data type.
     * Optionally filter by date range using MongoDB-style queries.
     */
    async fetchData(
        dataType: HCGatewayDataType,
        queries: Record<string, unknown> = {}
    ): Promise<HCGatewayRecord[]> {
        await this.ensureValidToken()

        const url = `${this.baseUrl}/api/v2/fetch/${dataType}`

        const response = await requestUrl({
            url,
            method: 'POST',
            headers: this.createAuthHeaders(),
            body: JSON.stringify({ queries }),
            throw: false
        })

        if (response.status === 403) {
            // Token might have expired between check and request; try refresh once
            log('HCGateway: 403 on fetch, attempting token refresh', 'debug')
            await this.refresh()

            const retryResponse = await requestUrl({
                url,
                method: 'POST',
                headers: this.createAuthHeaders(),
                body: JSON.stringify({ queries }),
                throw: false
            })

            if (retryResponse.status !== 200) {
                throw new Error(
                    `HCGateway fetch failed after refresh: HTTP ${retryResponse.status}`
                )
            }

            return (retryResponse.json as HCGatewayRecord[] | undefined) ?? []
        }

        if (response.status !== 200) {
            const errorBody = response.json as Record<string, unknown> | undefined
            const errorMsg = errorBody?.['error'] ?? `HTTP ${response.status}`
            throw new Error(`HCGateway fetch ${dataType} failed: ${String(errorMsg)}`)
        }

        return (response.json as HCGatewayRecord[] | undefined) ?? []
    }

    // ---- Token Management ----

    /**
     * Check if the current token is expired and refresh if needed.
     */
    async ensureValidToken(): Promise<void> {
        if (!this.token) {
            throw new Error('Not authenticated. Please log in first.')
        }

        if (!this.tokenExpiry) return

        const now = new Date()
        const expiry = new Date(this.tokenExpiry)

        // Refresh 5 minutes before actual expiry for safety margin
        const bufferMs = 5 * 60 * 1000
        if (now.getTime() >= expiry.getTime() - bufferMs) {
            log('HCGateway: Token expiring soon, refreshing', 'debug')
            await this.refresh()
        }
    }

    /**
     * Check whether we have a token (does not validate it).
     */
    hasToken(): boolean {
        return this.token.length > 0
    }

    // ---- Helpers ----

    private createAuthHeaders(): Record<string, string> {
        return {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.token}`
        }
    }
}
