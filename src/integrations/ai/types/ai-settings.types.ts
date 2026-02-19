/**
 * Supported AI provider types
 */
export type AIProviderType = 'openai' | 'openrouter'

/**
 * Labels for AI provider types
 */
export const AI_PROVIDER_LABELS: Record<AIProviderType, string> = {
    openai: 'OpenAI',
    openrouter: 'OpenRouter'
}

/**
 * AI provider configuration
 */
export interface AIProviderConfig {
    /** Provider type */
    type: AIProviderType
    /** API key for authentication */
    apiKey: string
    /** Model to use (e.g., "gpt-4o", "anthropic/claude-sonnet-4") */
    model: string
    /** Custom API base URL (optional, for self-hosted or proxy) */
    baseUrl: string
}

/**
 * AI integration settings
 */
export interface AISettings {
    /** Enable AI integration */
    enabled: boolean

    /** Active provider configuration */
    provider: AIProviderConfig

    /** Whether to auto-analyze after capture completion */
    analyzeAfterCapture: boolean

    /** Custom system prompt for capture analysis */
    captureAnalysisPrompt: string

    /** Custom system prompt for daily summary */
    dailySummaryPrompt: string

    /** Daily summary configuration */
    dailySummary: DailySummarySettings

    /** Custom system prompt for weekly summary */
    weeklySummaryPrompt: string

    /** Weekly summary configuration */
    weeklySummary: WeeklySummarySettings

    /** Custom system prompt for monthly summary */
    monthlySummaryPrompt: string

    /** Monthly summary configuration */
    monthlySummary: MonthlySummarySettings

    /** Auto-save reports to note after AI generation */
    autoSaveToNote: boolean

    /** Also save reports to a dedicated folder ("Life Tracker Reports") */
    saveToFolder: boolean

    /** Folder path for saving reports when saveToFolder is enabled */
    reportFolderPath: string
}

/**
 * Weekly summary specific settings
 */
export interface WeeklySummarySettings {
    /** Tag to filter notes for weekly summary (e.g., "daily") */
    filterTag: string

    /** Default date range: 'this_week' | 'last_week' | 'custom' */
    defaultDateRange: WeeklySummaryDateRange

    /** Include CSV data in the prompt */
    includeCsvData: boolean

    /** Properties to include (empty = all numeric/boolean properties) */
    includeProperties: string[]
}

/**
 * Weekly summary date range options
 */
export type WeeklySummaryDateRange = 'this_week' | 'last_week'

/**
 * Labels for weekly summary date range options
 */
export const WEEKLY_SUMMARY_DATE_RANGE_LABELS: Record<WeeklySummaryDateRange, string> = {
    this_week: 'This week',
    last_week: 'Last week'
}

/**
 * Monthly summary specific settings
 */
export interface MonthlySummarySettings {
    /** Tag to filter notes for monthly summary (e.g., "daily") */
    filterTag: string

    /** Default date range: 'this_month' | 'last_month' */
    defaultDateRange: MonthlySummaryDateRange

    /** Include CSV data in the prompt */
    includeCsvData: boolean

    /** Properties to include (empty = all numeric/boolean properties) */
    includeProperties: string[]
}

/**
 * Monthly summary date range options
 */
export type MonthlySummaryDateRange = 'this_month' | 'last_month'

/**
 * Labels for monthly summary date range options
 */
export const MONTHLY_SUMMARY_DATE_RANGE_LABELS: Record<MonthlySummaryDateRange, string> = {
    this_month: 'This month',
    last_month: 'Last month'
}

/**
 * Daily summary specific settings
 */
export interface DailySummarySettings {
    /** Tag to filter notes for daily summary (e.g., "daily") */
    filterTag: string

    /** Default date range: 'today' | 'yesterday' */
    defaultDateRange: DailySummaryDateRange

    /** Include CSV data in the prompt */
    includeCsvData: boolean

    /** Properties to include (empty = all numeric/boolean properties) */
    includeProperties: string[]
}

/**
 * Daily summary date range options
 */
export type DailySummaryDateRange = 'today' | 'yesterday'

/**
 * Labels for daily summary date range options
 */
export const DAILY_SUMMARY_DATE_RANGE_LABELS: Record<DailySummaryDateRange, string> = {
    today: 'Today',
    yesterday: 'Yesterday'
}

/**
 * Result from an AI analysis call
 */
export interface AIAnalysisResult {
    /** Whether the call succeeded */
    success: boolean
    /** The analysis text (markdown formatted) */
    content: string
    /** Error message if failed */
    error?: string
    /** Provider that was used */
    provider: AIProviderType
    /** Model that was used */
    model: string
    /** Token usage info (if available) */
    usage?: {
        promptTokens: number
        completionTokens: number
        totalTokens: number
    }
}

/**
 * Default AI provider config
 */
export const DEFAULT_AI_PROVIDER_CONFIG: AIProviderConfig = {
    type: 'openai',
    apiKey: '',
    model: 'gpt-4o-mini',
    baseUrl: ''
}

/**
 * Default daily summary settings
 */
export const DEFAULT_DAILY_SUMMARY_SETTINGS: DailySummarySettings = {
    filterTag: '',
    defaultDateRange: 'today',
    includeCsvData: true,
    includeProperties: []
}

/**
 * Default weekly summary settings
 */
export const DEFAULT_WEEKLY_SUMMARY_SETTINGS: WeeklySummarySettings = {
    filterTag: '',
    defaultDateRange: 'this_week',
    includeCsvData: true,
    includeProperties: []
}

/**
 * Default monthly summary settings
 */
export const DEFAULT_MONTHLY_SUMMARY_SETTINGS: MonthlySummarySettings = {
    filterTag: '',
    defaultDateRange: 'this_month',
    includeCsvData: true,
    includeProperties: []
}

/**
 * Default AI settings
 */
export const DEFAULT_AI_SETTINGS: AISettings = {
    enabled: false,
    provider: DEFAULT_AI_PROVIDER_CONFIG,
    analyzeAfterCapture: false,
    captureAnalysisPrompt: '',
    dailySummaryPrompt: '',
    dailySummary: DEFAULT_DAILY_SUMMARY_SETTINGS,
    weeklySummaryPrompt: '',
    weeklySummary: DEFAULT_WEEKLY_SUMMARY_SETTINGS,
    monthlySummaryPrompt: '',
    monthlySummary: DEFAULT_MONTHLY_SUMMARY_SETTINGS,
    autoSaveToNote: true,
    saveToFolder: false,
    reportFolderPath: 'Life Tracker Reports'
}

/**
 * Common AI models by provider
 */
export const AI_MODELS: Record<AIProviderType, Array<{ id: string; label: string }>> = {
    openai: [
        { id: 'gpt-4o', label: 'GPT-4o' },
        { id: 'gpt-4o-mini', label: 'GPT-4o Mini' },
        { id: 'gpt-4.1', label: 'GPT-4.1' },
        { id: 'gpt-4.1-mini', label: 'GPT-4.1 Mini' },
        { id: 'gpt-4.1-nano', label: 'GPT-4.1 Nano' },
        { id: 'o3-mini', label: 'o3-mini' }
    ],
    openrouter: [
        { id: 'anthropic/claude-sonnet-4', label: 'Claude Sonnet 4' },
        { id: 'anthropic/claude-3.5-sonnet', label: 'Claude 3.5 Sonnet' },
        { id: 'openai/gpt-4o', label: 'GPT-4o (via OpenRouter)' },
        { id: 'openai/gpt-4o-mini', label: 'GPT-4o Mini (via OpenRouter)' },
        { id: 'google/gemini-2.5-pro-preview', label: 'Gemini 2.5 Pro' },
        { id: 'meta-llama/llama-3.1-70b-instruct', label: 'Llama 3.1 70B' }
    ]
}
