/**
 * TickTick integration settings
 */
export interface TickTickSettings {
    /** Enable TickTick integration */
    enabled: boolean

    /** Sync mode: manual, auto, or script_trigger */
    syncMode: 'manual' | 'auto' | 'script_trigger'

    /** Authentication data */
    username: string
    password: string
    token: string | null
    inboxId: string | null

    /** Last sync checkpoint for incremental sync */
    lastSyncCheckpoint: number

    /** Auto-sync settings */
    autoSyncOnStartup: boolean
    syncIntervalMinutes: number

    /** Data filtering */
    syncCompletedOnly: boolean
    syncDateRangeDays: number
    syncProjectIds: string[]

    /** Project name mapping */
    projectMapping: Record<string, string>

    /** Additional tags to add to all imported tasks */
    addTags: string[]

    /** IANA timezone for date queries and task display (e.g., "Asia/Almaty") */
    timeZone: string
}

export const DEFAULT_TICKTICK_SETTINGS: TickTickSettings = {
    enabled: false,
    syncMode: 'manual',
    username: '',
    password: '',
    token: null,
    inboxId: null,
    lastSyncCheckpoint: 0,
    autoSyncOnStartup: false,
    syncIntervalMinutes: 60,
    syncCompletedOnly: false,
    syncDateRangeDays: 30,
    syncProjectIds: [],
    projectMapping: {},
    addTags: [],
    timeZone: 'Asia/Almaty'
}
