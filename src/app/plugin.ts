import { Plugin, type TFile } from 'obsidian'
import {
    DEFAULT_SETTINGS,
    type PluginSettings,
    type BatchFilterMode,
    type FileProvider,
    type SettingsChangeCallback,
    type SettingsChangeInfo
} from './types'
import { LifeTrackerPluginSettingTab } from './settings/settings-tab'
import { log } from '../utils'
import { produce } from 'immer'
import type { Draft } from 'immer'
import { LifeTrackerView, LIFE_TRACKER_VIEW_TYPE } from './view/life-tracker-view'
import { getLifeTrackerViewOptions } from './view/view-options'
import { GridView, GRID_VIEW_TYPE } from './view/grid-view/grid-view'
import { getGridViewOptions } from './view/grid-view/grid-view-options'
import { registerCommands } from './commands'
import { TickTickAPI } from '../integrations/ticktick/api/TickTickAPI'
import { TickTickAuthService } from '../integrations/ticktick/services/TickTickAuthService'
import { TickTickSyncService } from '../integrations/ticktick/services/TickTickSyncService'
import { TickTickToManualConverter } from '../integrations/ticktick/services/TickTickToManualConverter'
import { AIService } from '../integrations/ai/services/AIService'
import { HCGatewayAPI } from '../integrations/hcgateway/api/HCGatewayAPI'
import { HCGatewayAuthService } from '../integrations/hcgateway/services/HCGatewayAuthService'
import { HCGatewaySyncService } from '../integrations/hcgateway/services/HCGatewaySyncService'

export class LifeTrackerPlugin extends Plugin {
    /**
     * The plugin settings are immutable
     */
    settings: PluginSettings = produce(DEFAULT_SETTINGS, () => DEFAULT_SETTINGS)

    /**
     * Listeners for settings changes
     */
    private settingsChangeListeners: Set<SettingsChangeCallback> = new Set()

    /**
     * Currently active file provider (base view that can provide files for batch capture)
     */
    private activeFileProvider: FileProvider | null = null

    /**
     * TickTick API client
     */
    tickTickAPI!: TickTickAPI

    /**
     * TickTick authentication service
     */
    tickTickAuthService!: TickTickAuthService

    /**
     * TickTick synchronization service
     */
    tickTickSyncService!: TickTickSyncService

    /**
     * TickTick to manual format converter
     */
    tickTickConverter!: TickTickToManualConverter

    /**
     * AI service for LLM-based analysis
     */
    aiService!: AIService

    /**
     * HCGateway API client
     */
    hcGatewayAPI!: HCGatewayAPI

    /**
     * HCGateway authentication service
     */
    hcGatewayAuthService!: HCGatewayAuthService

    /**
     * HCGateway synchronization service
     */
    hcGatewaySyncService!: HCGatewaySyncService

    /**
     * Register a file provider as active (called when view becomes visible)
     */
    setActiveFileProvider(provider: FileProvider | null): void {
        this.activeFileProvider = provider
    }

    /**
     * Get files from the active file provider (if any)
     */
    getActiveProviderFiles(): TFile[] | null {
        if (!this.activeFileProvider) return null
        return this.activeFileProvider.getFiles()
    }

    /**
     * Get filter mode from the active file provider (if any)
     */
    getActiveProviderFilterMode(): BatchFilterMode | null {
        if (!this.activeFileProvider) return null
        return this.activeFileProvider.getFilterMode()
    }

    /**
     * Executed as soon as the plugin loads
     */
    override async onload() {
        log('Initializing', 'debug')
        await this.loadSettings()

        // Initialize TickTick services
        this.initializeTickTickServices()

        // Initialize HCGateway services
        this.initializeHCGatewayServices()

        // Initialize AI service
        this.aiService = new AIService(this.settings.ai.provider)

        // Register the Life Tracker Base View
        const registered = this.registerBasesView(LIFE_TRACKER_VIEW_TYPE, {
            name: 'Life Tracker',
            icon: 'activity',
            factory: (controller, containerEl) =>
                new LifeTrackerView(controller, containerEl, this),
            options: getLifeTrackerViewOptions
        })

        if (!registered) {
            log('Bases feature is not enabled in this vault', 'warn')
        } else {
            log('Life Tracker view registered', 'debug')
        }

        // Register the Grid View
        const gridRegistered = this.registerBasesView(GRID_VIEW_TYPE, {
            name: 'Life Tracker Grid',
            icon: 'layout-grid',
            factory: (controller, containerEl) => new GridView(controller, containerEl, this),
            options: getGridViewOptions
        })

        if (gridRegistered) {
            log('Life Tracker Grid view registered', 'debug')
        }

        // Add a settings screen for the plugin
        this.addSettingTab(new LifeTrackerPluginSettingTab(this.app, this))

        // Register commands
        registerCommands(this)
    }

    override onunload() {}

    /**
     * Initialize TickTick integration services
     */
    private initializeTickTickServices(): void {
        // Create API client with stored token if available
        const token = this.settings.ticktick.token || ''
        const inboxId = this.settings.ticktick.inboxId || ''
        this.tickTickAPI = new TickTickAPI(token)
        if (inboxId) {
            this.tickTickAPI.setInboxId(inboxId)
        }

        // Create authentication service
        this.tickTickAuthService = new TickTickAuthService(this.tickTickAPI)
        if (token && inboxId) {
            this.tickTickAuthService.restoreSession(token, inboxId)
        }

        // Create converter with project mapping
        this.tickTickConverter = new TickTickToManualConverter(
            this.settings.ticktick.projectMapping
        )

        // Create sync service
        this.tickTickSyncService = new TickTickSyncService(this.tickTickAPI, this.tickTickConverter)
    }

    /**
     * Initialize HCGateway integration services.
     * No token restore — a fresh login is performed on every capture.
     */
    private initializeHCGatewayServices(): void {
        const { baseUrl } = this.settings.hcgateway

        this.hcGatewayAPI = new HCGatewayAPI(baseUrl)
        this.hcGatewayAuthService = new HCGatewayAuthService(this.hcGatewayAPI)
        this.hcGatewaySyncService = new HCGatewaySyncService(this.hcGatewayAPI)
    }

    /**
     * Load the plugin settings
     */
    async loadSettings() {
        log('Loading settings', 'debug')
        const loadedSettings = (await this.loadData()) as PluginSettings | null

        if (!loadedSettings) {
            log('Using default settings', 'debug')
            this.settings = produce(DEFAULT_SETTINGS, (draft) => draft)
            return
        }

        this.settings = produce(DEFAULT_SETTINGS, (draft: Draft<PluginSettings>) => {
            // Load visualization presets
            if (Array.isArray(loadedSettings.visualizationPresets)) {
                draft.visualizationPresets = loadedSettings.visualizationPresets
            }

            // Load animation duration
            if (typeof loadedSettings.animationDuration === 'number') {
                draft.animationDuration = loadedSettings.animationDuration
            }

            // Load property definitions
            if (Array.isArray(loadedSettings.propertyDefinitions)) {
                draft.propertyDefinitions = loadedSettings.propertyDefinitions
            }

            // Load confetti setting
            if (typeof loadedSettings.showConfettiOnCapture === 'boolean') {
                draft.showConfettiOnCapture = loadedSettings.showConfettiOnCapture
            }

            // Load TickTick settings
            if (loadedSettings.ticktick) {
                draft.ticktick = {
                    ...draft.ticktick,
                    ...loadedSettings.ticktick
                }
                // Never persist password — clear any previously stored value
                draft.ticktick.password = ''
            }

            // Load thoughts property name
            if (typeof loadedSettings.thoughtsPropertyName === 'string') {
                draft.thoughtsPropertyName = loadedSettings.thoughtsPropertyName
            }

            // Load HCGateway settings
            if (loadedSettings.hcgateway) {
                draft.hcgateway = {
                    ...draft.hcgateway,
                    ...loadedSettings.hcgateway
                }
            }

            // Load AI settings
            if (loadedSettings.ai) {
                draft.ai = {
                    ...draft.ai,
                    ...loadedSettings.ai
                }
                // Ensure nested objects are properly merged
                if (loadedSettings.ai.provider) {
                    draft.ai.provider = {
                        ...draft.ai.provider,
                        ...loadedSettings.ai.provider
                    }
                }
                if (loadedSettings.ai.weeklySummary) {
                    draft.ai.weeklySummary = {
                        ...draft.ai.weeklySummary,
                        ...loadedSettings.ai.weeklySummary
                    }
                }
            }
        })

        log(`Settings loaded`, 'debug', loadedSettings)
    }

    /**
     * Save the plugin settings
     */
    async saveSettings() {
        log('Saving settings', 'debug', this.settings)
        await this.saveData(this.settings)
        log('Settings saved', 'debug', this.settings)
    }

    /**
     * Update settings immutably using immer
     * @param updater Function that receives a draft and can mutate it
     * @param changeInfo Information about what changed (for targeted updates)
     */
    async updateSettings(
        updater: (draft: Draft<PluginSettings>) => void,
        changeInfo: SettingsChangeInfo = { type: 'full' }
    ): Promise<void> {
        this.settings = produce(this.settings, updater)
        await this.saveSettings()
        this.notifySettingsChanged(changeInfo)
    }

    /**
     * Update a specific visualization preset
     * Triggers a targeted update for views that use this preset
     */
    async updatePreset(
        presetId: string,
        updater: (preset: Draft<PluginSettings['visualizationPresets'][number]>) => void
    ): Promise<void> {
        await this.updateSettings(
            (draft) => {
                const preset = draft.visualizationPresets.find((p) => p.id === presetId)
                if (preset) {
                    updater(preset)
                }
            },
            { type: 'preset-updated', presetId }
        )
    }

    /**
     * Register a callback to be notified when settings change
     * @param callback Function to call when settings change
     * @returns Function to unregister the callback
     */
    onSettingsChange(callback: SettingsChangeCallback): () => void {
        this.settingsChangeListeners.add(callback)
        return () => {
            this.settingsChangeListeners.delete(callback)
        }
    }

    /**
     * Notify all listeners that settings have changed
     * @param changeInfo Information about what changed
     */
    private notifySettingsChanged(changeInfo: SettingsChangeInfo): void {
        for (const listener of this.settingsChangeListeners) {
            try {
                listener(this.settings, changeInfo)
            } catch (error) {
                log('Error in settings change listener', 'error', error)
            }
        }
    }
}
