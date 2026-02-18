/**
 * HCGateway integration settings
 */
export interface HCGatewaySettings {
    /** Enable HCGateway integration */
    enabled: boolean

    /** Server base URL */
    baseUrl: string

    /** Authentication credentials */
    username: string

    /**
     * Password is NEVER persisted to disk.
     * Held in memory only during the settings session.
     */
    password: string

    /** Bearer token (persisted for session restore) */
    token: string | null

    /** Refresh token (persisted for session restore) */
    refreshToken: string | null

    /** Token expiry ISO datetime (persisted for auto-refresh) */
    tokenExpiry: string | null

    /** Data types to sync (empty = all available) */
    enabledDataTypes: string[]

    /** Frontmatter property prefix for health data (e.g., "health" -> "health_steps") */
    propertyPrefix: string

    /** Date range in days to fetch on each sync */
    syncDateRangeDays: number
}

export const DEFAULT_HCGATEWAY_SETTINGS: HCGatewaySettings = {
    enabled: false,
    baseUrl: 'http://localhost:6644',
    username: '',
    password: '',
    token: null,
    refreshToken: null,
    tokenExpiry: null,
    enabledDataTypes: [],
    propertyPrefix: 'health',
    syncDateRangeDays: 1
}
