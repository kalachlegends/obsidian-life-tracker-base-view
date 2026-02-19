/**
 * HCGateway integration settings.
 * Credentials (username + password) are persisted so that the plugin can
 * log in automatically on every capture without user interaction.
 */
export interface HCGatewaySettings {
    /** Enable HCGateway integration */
    enabled: boolean

    /** Server base URL */
    baseUrl: string

    /** Authentication credentials — persisted to disk */
    username: string

    /** Authentication password — persisted to disk */
    password: string

    /** Data types to sync (empty = all available) */
    enabledDataTypes: string[]

    /** Frontmatter property prefix for health data (e.g., "health" -> "health_steps") */
    propertyPrefix: string

    /** IANA timezone for date queries (e.g., "Asia/Almaty"). Ensures correct day boundaries. */
    timeZone: string
}

export const DEFAULT_HCGATEWAY_SETTINGS: HCGatewaySettings = {
    enabled: false,
    baseUrl: 'http://localhost:6644',
    username: '',
    password: '',
    enabledDataTypes: [],
    propertyPrefix: 'health',
    timeZone: 'Asia/Almaty'
}
