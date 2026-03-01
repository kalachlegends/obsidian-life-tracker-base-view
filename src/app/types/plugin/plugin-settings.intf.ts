import type { VisualizationType } from '../visualization/visualization-type.intf'
import type { ScaleConfig, ReferenceLineConfig } from '../column/column-config.types'
import type { PropertyDefinition } from '../property/property-definition.types'
import type { ChartColorScheme } from '../../../utils/color.utils'
import type { TickTickSettings } from './ticktick-settings.types'
import { DEFAULT_TICKTICK_SETTINGS } from './ticktick-settings.types'
import type { AISettings } from '../../../integrations/ai/types'
import { DEFAULT_AI_SETTINGS } from '../../../integrations/ai/types'
import type { HCGatewaySettings } from '../../../integrations/hcgateway/types'
import { DEFAULT_HCGATEWAY_SETTINGS } from '../../../integrations/hcgateway/types'

/**
 * Global preset for a property name pattern
 * Applied automatically when a property matches the pattern
 */
export interface PropertyVisualizationPreset {
    /** Unique ID for this preset */
    id: string
    /** Property name pattern (exact match, case-insensitive) */
    propertyNamePattern: string
    /** Visualization type to use */
    visualizationType: VisualizationType
    /** Optional scale configuration */
    scale?: ScaleConfig
    /** Optional color scheme for chart types */
    colorScheme?: ChartColorScheme
    /** Reference line configuration for cartesian charts */
    referenceLine?: ReferenceLineConfig
}

export interface PluginSettings {
    /**
     * Global visualization presets by property name
     * Applied automatically when a property name matches
     */
    visualizationPresets: PropertyVisualizationPreset[]

    /**
     * Animation duration in milliseconds
     * Controls how long visualization animations take to complete
     */
    animationDuration: number

    /**
     * Property definitions for capture/editing
     * Defines trackable properties with types, defaults, and constraints
     */
    propertyDefinitions: PropertyDefinition[]

    /**
     * Show confetti animation when completing property capture
     * Adds a fun celebration when all properties are saved
     */
    showConfettiOnCapture: boolean

    /**
     * TickTick integration settings
     * Configure connection to TickTick for task synchronization
     */
    ticktick: TickTickSettings

    /**
     * AI integration settings
     * Configure AI providers for data analysis and insights
     */
    ai: AISettings

    /**
     * HCGateway integration settings
     * Configure connection to HCGateway for Android Health Connect data
     */
    hcgateway: HCGatewaySettings

    /**
     * Frontmatter property name used for storing quick thoughts.
     * The "Capture thought" command appends entries to this list property.
     */
    thoughtsPropertyName: string

    /**
     * Folder path where daily notes are located.
     * Used by "Today's capture" and "Today's thought" commands to find today's note.
     * Empty string means vault root.
     */
    dailyNotesFolder: string

    /**
     * Frontmatter property name used for storing meal entries.
     * Each meal is stored as a string: "[HH:mm] Name | cal:N p:N c:N f:N"
     */
    mealsPropertyName: string

    /**
     * Prefix for aggregated nutrition frontmatter properties.
     * Generates: {prefix}_calories, {prefix}_protein, {prefix}_carbs, {prefix}_fat
     */
    nutritionPropertyPrefix: string

    /**
     * Whether to auto-create today's daily note when it doesn't exist.
     * Reads the core Daily Notes plugin config for folder, template, and date format.
     */
    autoCreateDailyNote: boolean

    /**
     * Custom system prompt for AI food image analysis.
     * Empty string uses the built-in default prompt.
     */
    mealAnalysisPrompt: string
}

export const DEFAULT_SETTINGS: PluginSettings = {
    visualizationPresets: [],
    animationDuration: 3000,
    propertyDefinitions: [],
    showConfettiOnCapture: true,
    ticktick: DEFAULT_TICKTICK_SETTINGS,
    ai: DEFAULT_AI_SETTINGS,
    hcgateway: DEFAULT_HCGATEWAY_SETTINGS,
    thoughtsPropertyName: 'thoughts',
    dailyNotesFolder: '',
    mealsPropertyName: 'meals',
    nutritionPropertyPrefix: 'nutrition',
    autoCreateDailyNote: true,
    mealAnalysisPrompt: ''
}
