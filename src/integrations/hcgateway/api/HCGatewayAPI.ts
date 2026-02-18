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
        log(`[HCGateway API] POST ${url} (login, user=${username})`, 'debug')

        const response = await requestUrl({
            url,
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        })

        log(`[HCGateway API] Login response: status=${response.status}`, 'debug')

        if (response.status !== 200 && response.status !== 201) {
            const errorBody = response.json as Record<string, unknown> | undefined
            const errorMsg = errorBody?.['error'] ?? `HTTP ${response.status}`
            log(
                `[HCGateway API] Login failed: ${String(errorMsg)}, body=${JSON.stringify(errorBody)}`,
                'error'
            )
            throw new Error(`HCGateway login failed: ${String(errorMsg)}`)
        }

        const data = response.json as HCGatewayAuthResponse
        this.token = data.token
        this.refreshToken = data.refresh
        this.tokenExpiry = data.expiry

        log(
            `[HCGateway API] Login success, token=${data.token.slice(0, 8)}..., expiry=${data.expiry}`,
            'debug'
        )

        return data
    }

    /**
     * Refresh the bearer token using the stored refresh token.
     */
    async refresh(): Promise<HCGatewayAuthResponse> {
        if (!this.refreshToken) {
            log('[HCGateway API] Refresh called but no refresh token available', 'error')
            throw new Error('No refresh token available')
        }

        const url = `${this.baseUrl}/api/v2/refresh`
        log(`[HCGateway API] POST ${url} (token refresh)`, 'debug')

        const response = await requestUrl({
            url,
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ refresh: this.refreshToken })
        })

        log(`[HCGateway API] Refresh response: status=${response.status}`, 'debug')

        if (response.status !== 200) {
            const errorBody = response.json as Record<string, unknown> | undefined
            const errorMsg = errorBody?.['error'] ?? `HTTP ${response.status}`
            log(
                `[HCGateway API] Refresh failed: ${String(errorMsg)}, body=${JSON.stringify(errorBody)}`,
                'error'
            )
            throw new Error(`HCGateway token refresh failed: ${String(errorMsg)}`)
        }

        const data = response.json as HCGatewayAuthResponse
        this.token = data.token
        this.refreshToken = data.refresh
        this.tokenExpiry = data.expiry

        log(
            `[HCGateway API] Refresh success, new token=${data.token.slice(0, 8)}..., expiry=${data.expiry}`,
            'debug'
        )

        return data
    }

    /**
     * Revoke the current token.
     */
    async revoke(): Promise<void> {
        if (!this.token) {
            log('[HCGateway API] Revoke called but no token to revoke', 'debug')
            return
        }

        const url = `${this.baseUrl}/api/v2/revoke`
        log(`[HCGateway API] DELETE ${url} (revoke token)`, 'debug')

        await requestUrl({
            url,
            method: 'DELETE',
            headers: this.createAuthHeaders(),
            throw: false
        })

        this.token = ''
        this.refreshToken = ''
        this.tokenExpiry = ''
        log('[HCGateway API] Token revoked, credentials cleared', 'debug')
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
        const requestBody = JSON.stringify({ queries })
        log(`[HCGateway API] POST ${url} | queries=${JSON.stringify(queries)}`, 'debug')

        const response = await requestUrl({
            url,
            method: 'POST',
            headers: this.createAuthHeaders(),
            body: requestBody,
            throw: false
        })

        log(`[HCGateway API] ${dataType} response: status=${response.status}`, 'debug')

        if (response.status === 403) {
            // Token might have expired between check and request; try refresh once
            log(
                `[HCGateway API] 403 on fetch ${dataType}, body=${JSON.stringify(response.json)}, attempting token refresh`,
                'warn'
            )
            await this.refresh()

            log(`[HCGateway API] Retrying POST ${url} after token refresh`, 'debug')
            const retryResponse = await requestUrl({
                url,
                method: 'POST',
                headers: this.createAuthHeaders(),
                body: requestBody,
                throw: false
            })

            log(
                `[HCGateway API] ${dataType} retry response: status=${retryResponse.status}`,
                'debug'
            )

            if (retryResponse.status !== 200) {
                log(
                    `[HCGateway API] ${dataType} retry failed: status=${retryResponse.status}, body=${JSON.stringify(retryResponse.json)}`,
                    'error'
                )
                throw new Error(
                    `HCGateway fetch failed after refresh: HTTP ${retryResponse.status}`
                )
            }

            const retryRecords = (retryResponse.json as HCGatewayRecord[] | undefined) ?? []
            log(
                `[HCGateway API] ${dataType} retry success: ${retryRecords.length} records`,
                'debug'
            )
            return retryRecords
        }

        if (response.status !== 200) {
            const errorBody = response.json as Record<string, unknown> | undefined
            const errorMsg = errorBody?.['error'] ?? `HTTP ${response.status}`
            log(
                `[HCGateway API] ${dataType} fetch failed: ${String(errorMsg)}, body=${JSON.stringify(errorBody)}`,
                'error'
            )
            throw new Error(`HCGateway fetch ${dataType} failed: ${String(errorMsg)}`)
        }

        const records = (response.json as HCGatewayRecord[] | undefined) ?? []
        log(`[HCGateway API] ${dataType}: ${records.length} records received`, 'debug')

        // Log first record's data shape for debugging
        const firstRecord = records[0]
        if (firstRecord) {
            log(
                `[HCGateway API] ${dataType} sample record: data keys=[${Object.keys(firstRecord.data).join(', ')}], start=${firstRecord.start}, end=${firstRecord.end ?? 'null'}`,
                'debug'
            )
            log(
                `[HCGateway API] ${dataType} sample data: ${JSON.stringify(firstRecord.data)}`,
                'debug'
            )
        }

        return records
    }

    // ---- Token Management ----

    /**
     * Check if the current token is expired and refresh if needed.
     */
    async ensureValidToken(): Promise<void> {
        if (!this.token) {
            log('[HCGateway API] ensureValidToken: no token set, throwing', 'error')
            throw new Error('Not authenticated. Please log in first.')
        }

        if (!this.tokenExpiry) {
            log(
                `[HCGateway API] ensureValidToken: token present (${this.token.slice(0, 8)}...), no expiry set, skipping refresh check`,
                'debug'
            )
            return
        }

        const now = new Date()
        const expiry = new Date(this.tokenExpiry)
        const remainingMs = expiry.getTime() - now.getTime()
        const remainingMin = Math.round(remainingMs / 60000)

        log(
            `[HCGateway API] ensureValidToken: expiry=${this.tokenExpiry}, remaining=${remainingMin}min`,
            'debug'
        )

        // Refresh 5 minutes before actual expiry for safety margin
        const bufferMs = 5 * 60 * 1000
        if (now.getTime() >= expiry.getTime() - bufferMs) {
            log(
                `[HCGateway API] Token expiring in ${remainingMin}min (buffer=5min), refreshing now`,
                'debug'
            )
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
