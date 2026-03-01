import { App, Notice, PluginSettingTab, Setting } from 'obsidian'
import type { LifeTrackerPlugin } from '../plugin'
import { FolderSuggest } from '../components/ui/folder-suggest'
import { CSS_CLASS, CSS_SELECTOR, type ChartColorScheme } from '../../utils'
import {
    VisualizationType,
    SETTINGS_TAB_VISUALIZATION_OPTIONS,
    SCALE_PRESETS_RECORD,
    supportsScale,
    supportsColorScheme,
    PROPERTY_TYPES,
    PROPERTY_TYPE_LABELS,
    MAPPING_TYPE_LABELS,
    createDefaultPropertyDefinition,
    createDefaultMapping,
    AI_PROVIDER_LABELS,
    AI_MODELS,
    DAILY_SUMMARY_DATE_RANGE_LABELS,
    WEEKLY_SUMMARY_DATE_RANGE_LABELS,
    MONTHLY_SUMMARY_DATE_RANGE_LABELS,
    type PropertyVisualizationPreset,
    type PropertyDefinition,
    type ObsidianPropertyType,
    type MappingType,
    type AIProviderType,
    type DailySummaryDateRange,
    type WeeklySummaryDateRange,
    type MonthlySummaryDateRange
} from '../types'
import {
    HCGATEWAY_DATA_TYPE_CATEGORIES,
    HCGATEWAY_DATA_TYPE_LABELS,
    type HCGatewayDataType
} from '../../integrations/hcgateway/types'

/**
 * Color scheme options for the preset dropdown
 */
const COLOR_SCHEME_OPTIONS: Record<string, string> = {
    default: 'Default',
    green: 'Green',
    blue: 'Blue',
    purple: 'Purple',
    orange: 'Orange',
    red: 'Red'
}

type SettingsTab = 'properties' | 'visualizations' | 'integrations' | 'about'

export class LifeTrackerPluginSettingTab extends PluginSettingTab {
    plugin: LifeTrackerPlugin
    private activeTab: SettingsTab = 'properties'
    // Track which property definitions are expanded (by id)
    private expandedDefinitions: Set<string> = new Set()
    // Drag and drop state
    private draggedDefinitionId: string | null = null

    constructor(app: App, plugin: LifeTrackerPlugin) {
        super(app, plugin)
        this.plugin = plugin
    }

    display(): void {
        const { containerEl } = this
        containerEl.empty()
        containerEl.addClass('lt-settings')

        // Render tab navigation
        this.renderTabNav(containerEl)

        // Render content container
        const contentEl = containerEl.createDiv({ cls: 'lt-settings-content' })

        // Render active tab content
        switch (this.activeTab) {
            case 'properties':
                this.renderPropertiesTab(contentEl)
                break
            case 'visualizations':
                this.renderVisualizationsTab(contentEl)
                break
            case 'integrations':
                this.renderIntegrationsTab(contentEl)
                break
            case 'about':
                this.renderAboutTab(contentEl)
                break
        }
    }

    private renderTabNav(containerEl: HTMLElement): void {
        const navEl = containerEl.createDiv({ cls: 'lt-settings-nav' })

        const tabs: Array<{ id: SettingsTab; label: string }> = [
            { id: 'properties', label: 'Property definitions' },
            { id: 'visualizations', label: 'Visualizations' },
            { id: 'integrations', label: 'Integrations' },
            { id: 'about', label: 'About' }
        ]

        for (const tab of tabs) {
            const tabEl = navEl.createDiv({
                cls: `lt-settings-nav-tab ${this.activeTab === tab.id ? 'lt-settings-nav-tab--active' : ''}`
            })
            tabEl.textContent = tab.label
            tabEl.addEventListener('click', () => {
                this.activeTab = tab.id
                this.display()
            })
        }
    }

    // ========================================
    // Properties Tab
    // ========================================

    private renderPropertiesTab(containerEl: HTMLElement): void {
        const desc = new DocumentFragment()
        desc.createDiv({
            text: 'Define properties to track. These determine what appears in the capture dialog and editing views.'
        })
        new Setting(containerEl).setDesc(desc)

        // Capture settings
        new Setting(containerEl)
            .setName('Confetti celebration')
            .setDesc('Show confetti animation when completing property capture')
            .addToggle((toggle) => {
                toggle
                    .setValue(this.plugin.settings.showConfettiOnCapture)
                    .onChange(async (value) => {
                        await this.plugin.updateSettings((draft) => {
                            draft.showConfettiOnCapture = value
                        })
                    })
            })

        // Thoughts property name
        new Setting(containerEl)
            .setName('Thoughts property name')
            .setDesc(
                'Frontmatter property used by the "Capture thought" command to store quick thoughts as a list.'
            )
            .addText((text) => {
                text.setPlaceholder('thoughts')
                    .setValue(this.plugin.settings.thoughtsPropertyName)
                    .onChange(async (value) => {
                        await this.plugin.updateSettings((draft) => {
                            draft.thoughtsPropertyName = value.trim() || 'thoughts'
                        })
                    })
            })

        // Daily notes folder
        new Setting(containerEl)
            .setName('Daily notes folder')
            .setDesc(
                'Folder where daily notes are located. Used by "Today\'s capture" and "Today\'s thought" commands. Leave empty for vault root.'
            )
            .addText((text) => {
                text.setPlaceholder('e.g., Daily Notes')
                    .setValue(this.plugin.settings.dailyNotesFolder)
                    .onChange(async (value) => {
                        await this.plugin.updateSettings((draft) => {
                            draft.dailyNotesFolder = value.trim()
                        })
                    })
                new FolderSuggest(text.inputEl, this.app)
            })

        // Auto-create daily note
        new Setting(containerEl)
            .setName('Auto-create daily note')
            .setDesc(
                "Automatically create today's daily note when it doesn't exist. Uses the core Daily Notes plugin template if configured."
            )
            .addToggle((toggle) => {
                toggle
                    .setValue(this.plugin.settings.autoCreateDailyNote)
                    .onChange(async (value) => {
                        await this.plugin.updateSettings((draft) => {
                            draft.autoCreateDailyNote = value
                        })
                    })
            })

        // Meals property name
        new Setting(containerEl)
            .setName('Meals property name')
            .setDesc(
                'Frontmatter property used to store meal entries as a list. Each entry includes time, name, and nutrition data.'
            )
            .addText((text) => {
                text.setPlaceholder('meals')
                    .setValue(this.plugin.settings.mealsPropertyName)
                    .onChange(async (value) => {
                        await this.plugin.updateSettings((draft) => {
                            draft.mealsPropertyName = value.trim() || 'meals'
                        })
                    })
            })

        // Nutrition property prefix
        new Setting(containerEl)
            .setName('Nutrition property prefix')
            .setDesc(
                'Prefix for aggregated nutrition properties (e.g., nutrition_calories, nutrition_protein). These are auto-calculated from meal entries.'
            )
            .addText((text) => {
                text.setPlaceholder('nutrition')
                    .setValue(this.plugin.settings.nutritionPropertyPrefix)
                    .onChange(async (value) => {
                        await this.plugin.updateSettings((draft) => {
                            draft.nutritionPropertyPrefix = value.trim() || 'nutrition'
                        })
                    })
            })

        // Custom meal analysis prompt
        new Setting(containerEl)
            .setName('Food analysis prompt')
            .setDesc(
                'Custom system prompt for AI food image analysis. Leave empty to use the default prompt. Requires AI integration to be enabled.'
            )
            .addTextArea((textarea) => {
                textarea
                    .setPlaceholder('Leave empty for default prompt...')
                    .setValue(this.plugin.settings.mealAnalysisPrompt)
                    .onChange(async (value) => {
                        await this.plugin.updateSettings((draft) => {
                            draft.mealAnalysisPrompt = value
                        })
                    })
                textarea.inputEl.rows = 4
                textarea.inputEl.addClass('lt-settings-textarea')
            })

        // Separator
        containerEl.createEl('hr', { cls: 'lt-settings-separator' })

        // Property definitions header
        new Setting(containerEl).setName('Property definitions').setHeading()

        // List existing definitions
        const definitionsContainer = containerEl.createDiv({
            cls: 'lt-property-definitions-container'
        })
        this.renderPropertyDefinitionsList(definitionsContainer)

        // Add new definition button
        new Setting(containerEl).addButton((button) => {
            button
                .setButtonText('Add property definition')
                .setIcon('plus')
                .onClick(async () => {
                    await this.addNewPropertyDefinition()
                    this.display()
                })
        })
    }

    private renderPropertyDefinitionsList(container: HTMLElement): void {
        container.empty()

        const definitions = this.plugin.settings.propertyDefinitions

        if (definitions.length === 0) {
            container.createDiv({
                cls: 'lt-property-definitions-empty',
                text: 'No property definitions configured. Add a definition to enable property capture and editing.'
            })
            return
        }

        // Sort by order
        const sortedDefinitions = [...definitions].sort((a, b) => a.order - b.order)

        for (const definition of sortedDefinitions) {
            this.renderPropertyDefinitionItem(container, definition)
        }
    }

    private renderPropertyDefinitionItem(
        container: HTMLElement,
        definition: PropertyDefinition,
        isNew: boolean = false
    ): void {
        const itemContainer = container.createDiv({
            cls: 'lt-property-definition-item',
            attr: {
                'draggable': 'true',
                'data-definition-id': definition.id
            }
        })

        // Drag and drop event handlers
        itemContainer.addEventListener('dragstart', (e) => {
            this.draggedDefinitionId = definition.id
            itemContainer.addClass('lt-property-definition-item--dragging')
            if (e.dataTransfer) {
                e.dataTransfer.effectAllowed = 'move'
                e.dataTransfer.setData('text/plain', definition.id)
            }
        })

        itemContainer.addEventListener('dragend', () => {
            this.draggedDefinitionId = null
            itemContainer.removeClass('lt-property-definition-item--dragging')
            // Remove drag-over class from all items
            container
                .querySelectorAll('.lt-property-definition-item--drag-over')
                .forEach((el) => el.removeClass('lt-property-definition-item--drag-over'))
        })

        itemContainer.addEventListener('dragover', (e) => {
            e.preventDefault()
            if (e.dataTransfer) {
                e.dataTransfer.dropEffect = 'move'
            }
            // Only show drag-over state if dragging a different item
            if (this.draggedDefinitionId && this.draggedDefinitionId !== definition.id) {
                itemContainer.addClass('lt-property-definition-item--drag-over')
            }
        })

        itemContainer.addEventListener('dragleave', () => {
            itemContainer.removeClass('lt-property-definition-item--drag-over')
        })

        itemContainer.addEventListener('drop', (e) => {
            e.preventDefault()
            itemContainer.removeClass('lt-property-definition-item--drag-over')

            if (!this.draggedDefinitionId || this.draggedDefinitionId === definition.id) {
                return
            }

            // Perform the reorder
            void this.reorderDefinitions(this.draggedDefinitionId, definition.id)
        })

        // Check if expanded (new items start expanded, others start collapsed)
        const isExpanded = isNew || this.expandedDefinitions.has(definition.id)

        // Main row with drag handle, chevron, name, type, and delete button
        const mainSetting = new Setting(itemContainer)
        mainSetting.settingEl.classList.add('lt-property-header')

        // Drag handle (grip icon)
        mainSetting.addButton((button) => {
            button
                .setIcon('grip-vertical')
                .setTooltip('Drag to reorder')
                .setClass('lt-property-drag-handle')
        })

        // Chevron toggle button
        mainSetting.addButton((button) => {
            button
                .setIcon(isExpanded ? 'chevron-down' : 'chevron-right')
                .setTooltip(isExpanded ? 'Collapse' : 'Expand')
                .setClass('lt-property-chevron')
                .onClick(() => {
                    if (this.expandedDefinitions.has(definition.id)) {
                        this.expandedDefinitions.delete(definition.id)
                    } else {
                        this.expandedDefinitions.add(definition.id)
                    }
                    // Toggle details visibility without full re-render
                    const detailsEl = itemContainer.querySelector(
                        CSS_SELECTOR.PROPERTY_DETAILS
                    ) as HTMLElement
                    if (detailsEl) {
                        const nowExpanded = this.expandedDefinitions.has(definition.id)
                        detailsEl.toggleClass('lt-hidden', !nowExpanded)
                        button.setIcon(nowExpanded ? 'chevron-down' : 'chevron-right')
                        button.setTooltip(nowExpanded ? 'Collapse' : 'Expand')
                    }
                })
        })

        // Property name input
        mainSetting.addText((text) => {
            text.setPlaceholder('Property name (frontmatter key)')
                .setValue(definition.name)
                .onChange(async (value) => {
                    await this.plugin.updateSettings((draft) => {
                        const d = draft.propertyDefinitions.find((d) => d.id === definition.id)
                        if (d) {
                            d.name = value
                        }
                    })
                })
            text.inputEl.classList.add('lt-property-name-input')
        })

        // Type dropdown
        mainSetting.addDropdown((dropdown) => {
            const options: Record<string, string> = {}
            for (const type of PROPERTY_TYPES) {
                options[type] = PROPERTY_TYPE_LABELS[type]
            }
            dropdown
                .addOptions(options)
                .setValue(definition.type)
                .onChange(async (value) => {
                    await this.plugin.updateSettings((draft) => {
                        const d = draft.propertyDefinitions.find((d) => d.id === definition.id)
                        if (d) {
                            d.type = value as ObsidianPropertyType
                            // Clear type-specific constraints when type changes
                            if (value !== 'number') {
                                d.numberRange = null
                            }
                            if (!['text', 'list', 'tags'].includes(value)) {
                                d.allowedValues = []
                            }
                        }
                    })
                    // Expand when type changes to show relevant options
                    this.expandedDefinitions.add(definition.id)
                    this.display()
                })
        })

        // Required toggle
        mainSetting.addToggle((toggle) => {
            toggle
                .setTooltip('Required')
                .setValue(definition.required ?? false)
                .onChange(async (value) => {
                    await this.plugin.updateSettings((draft) => {
                        const d = draft.propertyDefinitions.find((d) => d.id === definition.id)
                        if (d) {
                            d.required = value
                        }
                    })
                })
        })

        // Copy button
        mainSetting.addExtraButton((button) => {
            button
                .setIcon('copy')
                .setTooltip('Copy property definition')
                .onClick(async () => {
                    await this.copyPropertyDefinition(definition.id)
                    this.display()
                })
        })

        // Delete button
        mainSetting.addExtraButton((button) => {
            button
                .setIcon('trash')
                .setTooltip('Delete property definition')
                .onClick(async () => {
                    this.expandedDefinitions.delete(definition.id)
                    await this.deletePropertyDefinition(definition.id)
                    this.display()
                })
        })

        // Collapsible details container
        const detailsContainer = itemContainer.createDiv({
            cls: `${CSS_CLASS.PROPERTY_DETAILS}${isExpanded ? '' : ` ${CSS_CLASS.HIDDEN}`}`
        })

        // Type-specific options
        this.renderPropertyTypeOptions(detailsContainer, definition)
    }

    private renderPropertyTypeOptions(
        container: HTMLElement,
        definition: PropertyDefinition
    ): void {
        const optionsContainer = container.createDiv({ cls: 'lt-property-type-options' })

        // Display label (optional)
        new Setting(optionsContainer)
            .setName('Display label')
            .setDesc('Optional label shown in UI (defaults to property name)')
            .addText((text) => {
                text.setPlaceholder('Optional display label')
                    .setValue(definition.displayName)
                    .onChange(async (value) => {
                        await this.plugin.updateSettings((draft) => {
                            const d = draft.propertyDefinitions.find((d) => d.id === definition.id)
                            if (d) {
                                d.displayName = value
                            }
                        })
                    })
            })

        // Type-specific constraints
        if (definition.type === 'number') {
            this.renderNumberConstraints(optionsContainer, definition)
        } else if (['text', 'list', 'tags'].includes(definition.type)) {
            this.renderAllowedValues(optionsContainer, definition)
        }

        // Value mapping (only for text properties)
        if (definition.type === 'text') {
            this.renderValueMapping(optionsContainer, definition)
        }

        // Default value
        this.renderDefaultValue(optionsContainer, definition)

        // Description
        new Setting(optionsContainer)
            .setName('Description')
            .setDesc('Help text shown in capture dialog')
            .addTextArea((textarea) => {
                textarea
                    .setPlaceholder('Optional description or help text')
                    .setValue(definition.description)
                    .onChange(async (value) => {
                        await this.plugin.updateSettings((draft) => {
                            const d = draft.propertyDefinitions.find((d) => d.id === definition.id)
                            if (d) {
                                d.description = value
                            }
                        })
                    })
                textarea.inputEl.rows = 2
            })

        new Setting(optionsContainer)
            .setName('Script')
            .setDesc('Script to execute')
            .addTextArea((textarea) => {
                textarea
                    .setPlaceholder('Optional description or help text')
                    .setValue(definition.script)
                    .onChange(async (value) => {
                        await this.plugin.updateSettings((draft) => {
                            const d = draft.propertyDefinitions.find((d) => d.id === definition.id)
                            if (d) {
                                d.script = value
                            }
                        })
                    })
                textarea.inputEl.rows = 2
            })
        // Mappings (note filtering)
        this.renderMappings(optionsContainer, definition)
    }

    private renderMappings(container: HTMLElement, definition: PropertyDefinition): void {
        const mappingsContainer = container.createDiv({ cls: 'lt-mappings-container' })

        // Header with description
        new Setting(mappingsContainer)
            .setName('Note filtering')
            .setDesc(
                'Define which notes this property applies to. If no filters are set, property applies to all notes. Multiple filters use OR logic.'
            )
            .addButton((button) => {
                button
                    .setIcon('plus')
                    .setTooltip('Add filter')
                    .onClick(async () => {
                        await this.plugin.updateSettings((draft) => {
                            const d = draft.propertyDefinitions.find((d) => d.id === definition.id)
                            if (d) {
                                d.mappings.push(createDefaultMapping())
                            }
                        })
                        this.display()
                    })
            })

        // List existing mappings
        if (definition.mappings.length === 0) {
            mappingsContainer.createDiv({
                cls: 'lt-mappings-empty',
                text: 'No filters configured. This property applies to all notes.'
            })
            return
        }

        const mappingsList = mappingsContainer.createDiv({ cls: 'lt-mappings-list' })

        definition.mappings.forEach((_mapping, index) => {
            this.renderMappingItem(mappingsList, definition, index)
        })
    }

    private renderMappingItem(
        container: HTMLElement,
        definition: PropertyDefinition,
        mappingIndex: number
    ): void {
        const mapping = definition.mappings[mappingIndex]
        if (!mapping) return

        const setting = new Setting(container)
        setting.settingEl.classList.add('lt-mapping-item')

        // Enabled toggle
        setting.addToggle((toggle) => {
            toggle
                .setTooltip('Enable/disable filter')
                .setValue(mapping.enabled)
                .onChange(async (value) => {
                    await this.plugin.updateSettings((draft) => {
                        const d = draft.propertyDefinitions.find((d) => d.id === definition.id)
                        const m = d?.mappings[mappingIndex]
                        if (m) {
                            m.enabled = value
                        }
                    })
                })
        })

        // Type dropdown
        setting.addDropdown((dropdown) => {
            dropdown
                .addOptions(MAPPING_TYPE_LABELS)
                .setValue(mapping.type)
                .onChange(async (value) => {
                    await this.plugin.updateSettings((draft) => {
                        const d = draft.propertyDefinitions.find((d) => d.id === definition.id)
                        const m = d?.mappings[mappingIndex]
                        if (m) {
                            m.type = value as MappingType
                            m.value = ''
                        }
                    })
                    this.display()
                })
        })

        // Value input with placeholder based on type
        setting.addText((text) => {
            let placeholder = 'Value'
            switch (mapping.type) {
                case 'tag':
                    placeholder = 'tag-name (without #)'
                    break
                case 'folder':
                    placeholder = 'Start typing to search folders...'
                    break
                case 'regex':
                    placeholder = 'pattern (e.g., ^daily-)'
                    break
                case 'formula':
                    placeholder = 'Formula (not yet supported)'
                    break
            }

            text.setPlaceholder(placeholder)
                .setValue(mapping.value)
                .onChange(async (value) => {
                    await this.plugin.updateSettings((draft) => {
                        const d = draft.propertyDefinitions.find((d) => d.id === definition.id)
                        const m = d?.mappings[mappingIndex]
                        if (m) {
                            m.value = value
                        }
                    })
                })
            text.inputEl.classList.add('lt-mapping-value-input')

            // Add folder autocomplete for folder type
            if (mapping.type === 'folder') {
                new FolderSuggest(text.inputEl, this.app)
            }
        })

        // Delete button
        setting.addExtraButton((button) => {
            button
                .setIcon('trash')
                .setTooltip('Remove filter')
                .onClick(async () => {
                    await this.plugin.updateSettings((draft) => {
                        const d = draft.propertyDefinitions.find((d) => d.id === definition.id)
                        if (d) {
                            d.mappings.splice(mappingIndex, 1)
                        }
                    })
                    this.display()
                })
        })
    }

    private renderNumberConstraints(container: HTMLElement, definition: PropertyDefinition): void {
        const numberRange = definition.numberRange

        const constraintSetting = new Setting(container)
            .setName('Number range')
            .setDesc('Min and max values (leave both empty for no constraints)')

        // Min
        constraintSetting.addText((text) => {
            text.setPlaceholder('Min')
                .setValue(numberRange?.min?.toString() ?? '')
                .onChange(async (value) => {
                    await this.plugin.updateSettings((draft) => {
                        const d = draft.propertyDefinitions.find((d) => d.id === definition.id)
                        if (d) {
                            const min = value ? parseFloat(value) : null
                            const max = d.numberRange?.max ?? null
                            if (min !== null && max !== null) {
                                d.numberRange = { min, max }
                            } else if (min !== null) {
                                d.numberRange = { min, max: min + 100 }
                            } else {
                                d.numberRange = null
                            }
                        }
                    })
                })
            text.inputEl.type = 'number'
            text.inputEl.classList.add('lt-constraint-input')
        })

        // Max
        constraintSetting.addText((text) => {
            text.setPlaceholder('Max')
                .setValue(numberRange?.max?.toString() ?? '')
                .onChange(async (value) => {
                    await this.plugin.updateSettings((draft) => {
                        const d = draft.propertyDefinitions.find((d) => d.id === definition.id)
                        if (d) {
                            const max = value ? parseFloat(value) : null
                            const min = d.numberRange?.min ?? null
                            if (min !== null && max !== null) {
                                d.numberRange = { min, max }
                            } else if (max !== null) {
                                d.numberRange = { min: 0, max }
                            } else {
                                d.numberRange = null
                            }
                        }
                    })
                })
            text.inputEl.type = 'number'
            text.inputEl.classList.add('lt-constraint-input')
        })
    }

    private renderAllowedValues(container: HTMLElement, definition: PropertyDefinition): void {
        new Setting(container)
            .setName('Allowed values')
            .setDesc('Comma-separated list of allowed values (leave empty for free input)')
            .addTextArea((textarea) => {
                textarea
                    .setPlaceholder('value1, value2, value3')
                    .setValue(definition.allowedValues.join(', '))
                    .onChange(async (value) => {
                        await this.plugin.updateSettings((draft) => {
                            const d = draft.propertyDefinitions.find((d) => d.id === definition.id)
                            if (d) {
                                if (value.trim()) {
                                    d.allowedValues = value
                                        .split(',')
                                        .map((v) => v.trim())
                                        .filter(Boolean)
                                } else {
                                    d.allowedValues = []
                                }
                            }
                        })
                    })
                textarea.inputEl.rows = 2
            })
    }

    private renderValueMapping(container: HTMLElement, definition: PropertyDefinition): void {
        const mappingContainer = container.createDiv({ cls: 'lt-value-mapping-container' })

        new Setting(mappingContainer)
            .setName('Value mapping')
            .setDesc(
                'Map text values to numbers for calculations. Display shows original text, charts use mapped numbers. Example: "⭐" → 1, "⭐⭐" → 2'
            )
            .addButton((button) => {
                button
                    .setIcon('plus')
                    .setTooltip('Add value mapping')
                    .onClick(async () => {
                        // Blur any focused input to trigger onChange before adding new mapping
                        const activeElement = document.activeElement as HTMLElement
                        if (activeElement && activeElement.blur) {
                            activeElement.blur()
                        }

                        // Wait a bit for any pending onChange handlers to complete
                        await new Promise((resolve) => setTimeout(resolve, 50))

                        await this.plugin.updateSettings((draft) => {
                            const d = draft.propertyDefinitions.find((d) => d.id === definition.id)
                            if (d) {
                                if (!d.valueMapping) {
                                    d.valueMapping = {}
                                }
                                d.valueMapping[''] = 0
                            }
                        })
                        this.display()
                    })
            })

        if (!definition.valueMapping || Object.keys(definition.valueMapping).length === 0) {
            mappingContainer.createDiv({
                cls: 'lt-value-mapping-empty',
                text: 'No mappings configured.'
            })
            return
        }

        const mappingsList = mappingContainer.createDiv({ cls: 'lt-value-mapping-list' })

        for (const [textValue, numericValue] of Object.entries(definition.valueMapping)) {
            this.renderValueMappingItem(mappingsList, definition, textValue, numericValue)
        }
    }

    private renderValueMappingItem(
        container: HTMLElement,
        definition: PropertyDefinition,
        textValue: string,
        numericValue: number
    ): void {
        const setting = new Setting(container)

        // Text value input
        setting.addText((text) => {
            text.setPlaceholder('Text value (e.g., ⭐⭐⭐)')
                .setValue(textValue)
                .onChange(async (newTextValue) => {
                    await this.plugin.updateSettings((draft) => {
                        const d = draft.propertyDefinitions.find((d) => d.id === definition.id)
                        if (d?.valueMapping) {
                            delete d.valueMapping[textValue]
                            if (newTextValue.trim()) {
                                d.valueMapping[newTextValue.trim()] = numericValue
                            }
                        }
                    })
                })
        })

        // Arrow separator
        setting.settingEl.createSpan({ text: '→', cls: 'lt-value-mapping-arrow' })

        // Numeric value input
        setting.addText((text) => {
            text.setPlaceholder('Number')
                .setValue(String(numericValue))
                .onChange(async (value) => {
                    await this.plugin.updateSettings((draft) => {
                        const d = draft.propertyDefinitions.find((d) => d.id === definition.id)
                        if (d?.valueMapping && textValue in d.valueMapping) {
                            const num = parseFloat(value)
                            if (!isNaN(num)) {
                                d.valueMapping[textValue] = num
                            }
                        }
                    })
                })
            text.inputEl.type = 'number'
        })

        // Delete button
        setting.addExtraButton((button) => {
            button
                .setIcon('trash')
                .setTooltip('Remove mapping')
                .onClick(async () => {
                    // Blur any focused input to trigger onChange before deleting
                    const activeElement = document.activeElement as HTMLElement
                    if (activeElement && activeElement.blur) {
                        activeElement.blur()
                    }

                    // Wait a bit for any pending onChange handlers to complete
                    await new Promise((resolve) => setTimeout(resolve, 50))

                    await this.plugin.updateSettings((draft) => {
                        const d = draft.propertyDefinitions.find((d) => d.id === definition.id)
                        if (d?.valueMapping) {
                            delete d.valueMapping[textValue]
                            if (Object.keys(d.valueMapping).length === 0) {
                                d.valueMapping = null
                            }
                        }
                    })
                    this.display()
                })
        })
    }

    private renderDefaultValue(container: HTMLElement, definition: PropertyDefinition): void {
        const setting = new Setting(container)
            .setName('Default value')
            .setDesc('Click "Use default" in capture dialog to apply this value and advance')

        switch (definition.type) {
            case 'checkbox':
                setting.addToggle((toggle) => {
                    toggle.setValue(definition.defaultValue === true).onChange(async (value) => {
                        await this.plugin.updateSettings((draft) => {
                            const d = draft.propertyDefinitions.find((d) => d.id === definition.id)
                            if (d) {
                                d.defaultValue = value
                            }
                        })
                    })
                })
                break

            case 'number':
                setting.addText((text) => {
                    const defaultVal =
                        typeof definition.defaultValue === 'number'
                            ? definition.defaultValue.toString()
                            : ''
                    text.setPlaceholder('Default number')
                        .setValue(defaultVal)
                        .onChange(async (value) => {
                            await this.plugin.updateSettings((draft) => {
                                const d = draft.propertyDefinitions.find(
                                    (d) => d.id === definition.id
                                )
                                if (d) {
                                    d.defaultValue = value ? parseFloat(value) : null
                                }
                            })
                        })
                    text.inputEl.type = 'number'
                })
                break

            case 'text':
                if (definition.allowedValues.length > 0) {
                    setting.addDropdown((dropdown) => {
                        const options: Record<string, string> = { '': '(none)' }
                        for (const val of definition.allowedValues) {
                            const strVal = String(val)
                            options[strVal] = strVal
                        }
                        dropdown
                            .addOptions(options)
                            .setValue(String(definition.defaultValue ?? ''))
                            .onChange(async (value) => {
                                await this.plugin.updateSettings((draft) => {
                                    const d = draft.propertyDefinitions.find(
                                        (d) => d.id === definition.id
                                    )
                                    if (d) {
                                        d.defaultValue = value || null
                                    }
                                })
                            })
                    })
                } else {
                    setting.addText((text) => {
                        text.setPlaceholder('Default text')
                            .setValue(String(definition.defaultValue ?? ''))
                            .onChange(async (value) => {
                                await this.plugin.updateSettings((draft) => {
                                    const d = draft.propertyDefinitions.find(
                                        (d) => d.id === definition.id
                                    )
                                    if (d) {
                                        d.defaultValue = value || null
                                    }
                                })
                            })
                    })
                }
                break

            case 'date':
            case 'datetime':
                setting.addText((text) => {
                    text.setPlaceholder(
                        definition.type === 'date' ? 'YYYY-MM-DD' : 'YYYY-MM-DDTHH:mm'
                    )
                        .setValue(String(definition.defaultValue ?? ''))
                        .onChange(async (value) => {
                            await this.plugin.updateSettings((draft) => {
                                const d = draft.propertyDefinitions.find(
                                    (d) => d.id === definition.id
                                )
                                if (d) {
                                    d.defaultValue = value || null
                                }
                            })
                        })
                    text.inputEl.type = definition.type === 'date' ? 'date' : 'datetime-local'
                })
                break

            case 'list':
            case 'tags':
                setting.addTextArea((textarea) => {
                    const currentValue = Array.isArray(definition.defaultValue)
                        ? definition.defaultValue.join(', ')
                        : ''
                    textarea
                        .setPlaceholder('value1, value2 (comma-separated)')
                        .setValue(currentValue)
                        .onChange(async (value) => {
                            await this.plugin.updateSettings((draft) => {
                                const d = draft.propertyDefinitions.find(
                                    (d) => d.id === definition.id
                                )
                                if (d) {
                                    if (value.trim()) {
                                        d.defaultValue = value
                                            .split(',')
                                            .map((v) => v.trim())
                                            .filter(Boolean)
                                    } else {
                                        d.defaultValue = null
                                    }
                                }
                            })
                        })
                    textarea.inputEl.rows = 1
                })
                break
        }
    }

    private async addNewPropertyDefinition(): Promise<void> {
        const nextOrder = this.plugin.settings.propertyDefinitions.length
        const newDefinition = createDefaultPropertyDefinition(crypto.randomUUID(), nextOrder)
        // Auto-expand newly created definitions
        this.expandedDefinitions.add(newDefinition.id)
        await this.plugin.updateSettings((draft) => {
            draft.propertyDefinitions.push(newDefinition)
        })
    }

    private async deletePropertyDefinition(id: string): Promise<void> {
        await this.plugin.updateSettings((draft) => {
            draft.propertyDefinitions = draft.propertyDefinitions.filter((d) => d.id !== id)
        })
    }

    /**
     * Copy an existing property definition.
     * Creates a new definition with:
     * - New unique ID
     * - Empty name and displayName (user must fill in)
     * - All other properties copied (type, mappings, defaultValue, numberRange, allowedValues, etc.)
     */
    private async copyPropertyDefinition(sourceId: string): Promise<void> {
        const source = this.plugin.settings.propertyDefinitions.find((d) => d.id === sourceId)
        if (!source) return

        const nextOrder = this.plugin.settings.propertyDefinitions.length
        const newId = crypto.randomUUID()

        // Deep copy allowedValues preserving the type
        // PropertyAllowedValues is string[] | number[], spread operator loses the union distinction
        const copiedAllowedValues =
            source.allowedValues.length > 0 && typeof source.allowedValues[0] === 'number'
                ? (source.allowedValues.map((v) => v) as number[])
                : (source.allowedValues.map((v) => v) as string[])

        // Create copy with new ID, cleared name/displayName, and copied mappings
        const copiedDefinition: PropertyDefinition = {
            id: newId,
            name: '', // Clear - user must fill in
            displayName: '', // Clear - user must fill in
            script: source.script || '',
            type: source.type,
            allowedValues: copiedAllowedValues,
            numberRange: source.numberRange ? { ...source.numberRange } : null, // Deep copy object
            defaultValue: Array.isArray(source.defaultValue)
                ? [...source.defaultValue] // Deep copy array default values
                : source.defaultValue,
            required: source.required,
            description: source.description,
            order: nextOrder,
            mappings: source.mappings.map((m) => ({ ...m })), // Deep copy mappings
            valueMapping: source.valueMapping ? { ...source.valueMapping } : null // Deep copy value mapping
        }

        // Auto-expand the new definition
        this.expandedDefinitions.add(newId)

        await this.plugin.updateSettings((draft) => {
            draft.propertyDefinitions.push(copiedDefinition)
        })
    }

    /**
     * Reorder property definitions by moving the dragged item to the position of the target item.
     * Updates the order field for all affected items to maintain consistent ordering.
     */
    private async reorderDefinitions(draggedId: string, targetId: string): Promise<void> {
        await this.plugin.updateSettings(
            (draft) => {
                const definitions = draft.propertyDefinitions

                // Find the indices
                const draggedIndex = definitions.findIndex((d) => d.id === draggedId)
                const targetIndex = definitions.findIndex((d) => d.id === targetId)

                if (draggedIndex === -1 || targetIndex === -1) return

                // Remove the dragged item
                const [draggedItem] = definitions.splice(draggedIndex, 1)
                if (!draggedItem) return

                // Insert at the target position
                definitions.splice(targetIndex, 0, draggedItem)

                // Update all order values to reflect new positions
                definitions.forEach((def, index) => {
                    def.order = index
                })
            },
            { type: 'property-definitions-changed' }
        )

        // Re-render to show new order
        this.display()
    }

    // ========================================
    // Visualizations Tab
    // ========================================

    private renderVisualizationsTab(containerEl: HTMLElement): void {
        // Animation settings
        new Setting(containerEl).setName('Animation').setHeading()

        new Setting(containerEl)
            .setName('Animation duration')
            .setDesc('Duration of visualization animations in seconds')
            .addSlider((slider) => {
                slider
                    .setLimits(1, 10, 0.5)
                    .setValue(this.plugin.settings.animationDuration / 1000)
                    .setDynamicTooltip()
                    .onChange(async (value) => {
                        await this.plugin.updateSettings((draft) => {
                            draft.animationDuration = value * 1000
                        })
                    })
            })

        // Visualization presets
        new Setting(containerEl).setName('Visualization presets').setHeading()

        const desc = new DocumentFragment()
        desc.createDiv({
            text: 'Configure default visualizations for property names. These are applied automatically when a property matches.'
        })
        new Setting(containerEl).setDesc(desc)

        // List existing presets
        const presetsContainer = containerEl.createDiv({ cls: 'lt-presets-container' })
        this.renderPresetsList(presetsContainer)

        // Add new preset button
        new Setting(containerEl).addButton((button) => {
            button
                .setButtonText('Add preset')
                .setIcon('plus')
                .onClick(async () => {
                    await this.addNewPreset()
                    this.display()
                })
        })
    }

    private renderPresetsList(container: HTMLElement): void {
        container.empty()

        const presets = this.plugin.settings.visualizationPresets

        if (presets.length === 0) {
            container.createDiv({
                cls: 'lt-presets-empty',
                text: 'No presets configured. Add a preset to automatically configure visualizations for matching properties.'
            })
            return
        }

        for (const preset of presets) {
            this.renderPresetItem(container, preset)
        }
    }

    private renderPresetItem(container: HTMLElement, preset: PropertyVisualizationPreset): void {
        const setting = new Setting(container)

        // Property name input
        setting.addText((text) => {
            text.setPlaceholder('Property name')
                .setValue(preset.propertyNamePattern)
                .onChange(async (value) => {
                    await this.plugin.updatePreset(preset.id, (p) => {
                        p.propertyNamePattern = value
                    })
                })
            text.inputEl.classList.add('lt-preset-name-input')
        })

        // Visualization type dropdown
        setting.addDropdown((dropdown) => {
            dropdown
                .addOptions(SETTINGS_TAB_VISUALIZATION_OPTIONS)
                .setValue(preset.visualizationType)
                .onChange(async (value) => {
                    await this.plugin.updatePreset(preset.id, (p) => {
                        p.visualizationType = value as VisualizationType
                        if (!supportsScale(p.visualizationType)) {
                            p.scale = undefined
                        }
                        if (!supportsColorScheme(p.visualizationType)) {
                            p.colorScheme = undefined
                        }
                    })
                    this.display()
                })
        })

        // Scale dropdown (only for supported types)
        if (supportsScale(preset.visualizationType)) {
            setting.addDropdown((dropdown) => {
                const scaleOptions: Record<string, string> = {
                    auto: 'Auto'
                }
                for (const key of Object.keys(SCALE_PRESETS_RECORD)) {
                    if (key !== 'auto') {
                        scaleOptions[key] = key
                    }
                }

                let currentValue = 'auto'
                if (preset.scale) {
                    const matchingKey = Object.entries(SCALE_PRESETS_RECORD).find(
                        ([_, value]) =>
                            value?.min === preset.scale?.min && value?.max === preset.scale?.max
                    )
                    if (matchingKey) {
                        currentValue = matchingKey[0]
                    }
                }

                dropdown
                    .addOptions(scaleOptions)
                    .setValue(currentValue)
                    .onChange(async (value) => {
                        const scaleValue = SCALE_PRESETS_RECORD[value]
                        await this.plugin.updatePreset(preset.id, (p) => {
                            p.scale = scaleValue
                                ? { min: scaleValue.min, max: scaleValue.max }
                                : undefined
                        })
                    })
            })
        }

        // Color scheme dropdown (only for chart types)
        if (supportsColorScheme(preset.visualizationType)) {
            setting.addDropdown((dropdown) => {
                dropdown
                    .addOptions(COLOR_SCHEME_OPTIONS)
                    .setValue(preset.colorScheme ?? 'default')
                    .onChange(async (value) => {
                        await this.plugin.updatePreset(preset.id, (p) => {
                            p.colorScheme =
                                value === 'default' ? undefined : (value as ChartColorScheme)
                        })
                    })
            })
        }

        // Delete button
        setting.addExtraButton((button) => {
            button
                .setIcon('trash')
                .setTooltip('Delete preset')
                .onClick(async () => {
                    await this.deletePreset(preset.id)
                    this.display()
                })
        })
    }

    private async addNewPreset(): Promise<void> {
        const newPreset: PropertyVisualizationPreset = {
            id: crypto.randomUUID(),
            propertyNamePattern: '',
            visualizationType: VisualizationType.Heatmap
        }
        await this.plugin.updateSettings(
            (draft) => {
                draft.visualizationPresets.push(newPreset)
            },
            { type: 'preset-added', presetId: newPreset.id }
        )
    }

    private async deletePreset(id: string): Promise<void> {
        await this.plugin.updateSettings(
            (draft) => {
                draft.visualizationPresets = draft.visualizationPresets.filter((p) => p.id !== id)
            },
            { type: 'preset-deleted', presetId: id }
        )
    }

    // ========================================
    // Integrations Tab
    // ========================================

    private renderIntegrationsTab(containerEl: HTMLElement): void {
        // TickTick Section
        new Setting(containerEl).setName('TickTick').setHeading()

        const tickTickDesc = new DocumentFragment()
        tickTickDesc.createDiv({
            text: 'Connect to TickTick to import task completion data for productivity analysis.'
        })
        tickTickDesc.createEl('div', {
            text: '⚠️ Your credentials will be sent to api.ticktick.com',
            cls: 'lt-warning-text'
        })
        new Setting(containerEl).setDesc(tickTickDesc)

        // Enable/Disable Toggle
        new Setting(containerEl)
            .setName('Enable TickTick integration')
            .setDesc('Connect to TickTick for task data synchronization')
            .addToggle((toggle) => {
                toggle.setValue(this.plugin.settings.ticktick.enabled).onChange(async (value) => {
                    await this.plugin.updateSettings((draft) => {
                        draft.ticktick.enabled = value
                    })
                    this.display()
                })
            })

        if (this.plugin.settings.ticktick.enabled) {
            // Transient password storage — never persisted to disk
            let tickTickPassword = ''

            // Username
            new Setting(containerEl)
                .setName('Username')
                .setDesc('Your TickTick email')
                .addText((text) => {
                    text.setPlaceholder('your@email.com')
                        .setValue(this.plugin.settings.ticktick.username)
                        .onChange(async (value) => {
                            await this.plugin.updateSettings((draft) => {
                                draft.ticktick.username = value
                            })
                        })
                })

            // Password — kept in memory only, never saved to settings
            new Setting(containerEl)
                .setName('Password')
                .setDesc('Enter password to connect. It is not saved to disk.')
                .addText((text) => {
                    text.setPlaceholder('Enter password').onChange((value) => {
                        tickTickPassword = value
                    })
                    text.inputEl.type = 'password'
                })

            // Sync Mode
            new Setting(containerEl)
                .setName('Sync mode')
                .setDesc('How to trigger TickTick synchronization')
                .addDropdown((dropdown) => {
                    dropdown
                        .addOption('manual', 'Manual only')
                        .addOption('auto', 'Auto sync on startup')
                        .addOption('script_trigger', 'Via script (TickTickInput, TickTickSync)')
                        .setValue(this.plugin.settings.ticktick.syncMode)
                        .onChange(async (value) => {
                            await this.plugin.updateSettings((draft) => {
                                draft.ticktick.syncMode = value as
                                    | 'manual'
                                    | 'auto'
                                    | 'script_trigger'
                            })
                            this.display()
                        })
                })

            // Timezone
            new Setting(containerEl)
                .setName('Timezone')
                .setDesc(
                    'IANA timezone for task date display (e.g., "Asia/Almaty", "Europe/London"). Task times in frontmatter will be shown in this timezone.'
                )
                .addText((text) => {
                    text.setPlaceholder('Asia/Almaty')
                        .setValue(this.plugin.settings.ticktick.timeZone)
                        .onChange(async (value) => {
                            await this.plugin.updateSettings((draft) => {
                                draft.ticktick.timeZone = value.trim() || 'Asia/Almaty'
                            })
                        })
                })

            // Test Connection Button
            new Setting(containerEl)
                .setName('Connection')
                .setDesc('Test your TickTick connection')
                .addButton((button) => {
                    button
                        .setButtonText('Test Connection')
                        .setIcon('refresh-cw')
                        .onClick(async () => {
                            try {
                                button.setDisabled(true)
                                button.setButtonText('Testing...')
                                button.buttonEl.style.color = ''

                                // Validate credentials
                                const username = this.plugin.settings.ticktick.username

                                if (!username || !tickTickPassword) {
                                    new Notice(
                                        '❌ TickTick: Please enter both username and password'
                                    )
                                    return
                                }

                                // Test connection
                                new Notice('🔍 Testing TickTick connection...')

                                const loginSuccess = await this.plugin.tickTickAuthService.login({
                                    username,
                                    password: tickTickPassword
                                })

                                if (loginSuccess) {
                                    // Save the token and inboxId, clear password from settings
                                    const authData = this.plugin.tickTickAuthService.getAuthData()
                                    await this.plugin.updateSettings((draft) => {
                                        draft.ticktick.token = authData.token
                                        draft.ticktick.inboxId = authData.inboxId
                                        draft.ticktick.password = ''
                                    })
                                    button.buttonEl.style.color = 'var(--text-success)'
                                    new Notice('✅ TickTick: Successfully connected!')
                                } else {
                                    button.buttonEl.style.color = 'var(--text-error)'
                                    new Notice(
                                        '❌ TickTick: Invalid credentials or connection failed'
                                    )
                                }
                            } catch (error) {
                                console.error('TickTick connection test failed:', error)

                                // Provide specific error messages based on error type
                                let errorMessage = '❌ TickTick: Connection failed'

                                if (error instanceof Error) {
                                    if (error.message.includes('network')) {
                                        errorMessage =
                                            '❌ TickTick: Network error - check your internet connection'
                                    } else if (error.message.includes('timeout')) {
                                        errorMessage =
                                            '❌ TickTick: Connection timeout - please try again'
                                    } else if (error.message.includes('401')) {
                                        errorMessage = '❌ TickTick: Invalid credentials'
                                    } else if (error.message.includes('403')) {
                                        errorMessage =
                                            '❌ TickTick: Access denied - check your account'
                                    } else {
                                        errorMessage = `❌ TickTick: ${error.message}`
                                    }
                                }

                                new Notice(errorMessage)
                                button.buttonEl.style.color = 'var(--text-error)'
                            } finally {
                                // Always restore button state
                                button.setDisabled(false)
                                button.setButtonText('Test Connection')
                            }
                        })
                })

            // Script Commands Documentation
            containerEl.createEl('hr', { cls: 'lt-settings-separator' })
            new Setting(containerEl).setName('Script Commands').setHeading()

            const commandsDesc = new DocumentFragment()
            commandsDesc.createDiv({
                text: 'Use these commands in Property Definition Script field:',
                cls: 'lt-script-commands-desc'
            })

            const commandsList = commandsDesc.createEl('ul', { cls: 'lt-script-commands-list' })
            commandsList.createEl('li', {
                text: 'TickTickInput - Returns task counts and XP metrics'
            })
            commandsList.createEl('li', {
                text: 'TickTickSync - Syncs tasks and returns data in manual format'
            })
            commandsList.createEl('li', {
                text: "ticktick:today - Gets today's completed tasks count"
            })
            commandsList.createEl('li', { text: "ticktick:week - Gets this week's stats" })

            new Setting(containerEl).setDesc(commandsDesc)
        }

        // Separator between integrations
        containerEl.createEl('hr', { cls: 'lt-settings-separator' })

        // AI Integration
        this.renderAIIntegration(containerEl)

        // Separator between integrations
        containerEl.createEl('hr', { cls: 'lt-settings-separator' })

        // HCGateway (Health Connect) Integration
        this.renderHCGatewayIntegration(containerEl)
    }

    // ========================================
    // AI Integration Section (within Integrations Tab)
    // ========================================

    private renderAIIntegration(containerEl: HTMLElement): void {
        new Setting(containerEl).setName('AI analysis').setHeading()

        const aiDesc = new DocumentFragment()
        aiDesc.createDiv({
            text: 'Connect to AI providers to analyze your life tracking data. Supports OpenAI and OpenRouter (access to Claude, Gemini, Llama, and more).'
        })
        new Setting(containerEl).setDesc(aiDesc)

        // Enable/Disable Toggle
        new Setting(containerEl)
            .setName('Enable AI integration')
            .setDesc('Connect to an AI provider for data analysis and insights')
            .addToggle((toggle) => {
                toggle.setValue(this.plugin.settings.ai.enabled).onChange(async (value) => {
                    await this.plugin.updateSettings(
                        (draft) => {
                            draft.ai.enabled = value
                        },
                        { type: 'ai-settings-changed' }
                    )
                    this.display()
                })
            })

        if (!this.plugin.settings.ai.enabled) return

        // Provider Selection
        new Setting(containerEl)
            .setName('Provider')
            .setDesc('Select the AI provider to use')
            .addDropdown((dropdown) => {
                const options: Record<string, string> = {}
                for (const [key, label] of Object.entries(AI_PROVIDER_LABELS)) {
                    options[key] = label
                }
                dropdown
                    .addOptions(options)
                    .setValue(this.plugin.settings.ai.provider.type)
                    .onChange(async (value) => {
                        const providerType = value as AIProviderType
                        // Get a sensible default model for the new provider
                        const defaultModel = AI_MODELS[providerType]?.[0]?.id ?? ''
                        await this.plugin.updateSettings(
                            (draft) => {
                                draft.ai.provider.type = providerType
                                draft.ai.provider.model = defaultModel
                                draft.ai.provider.baseUrl = ''
                            },
                            { type: 'ai-settings-changed' }
                        )
                        this.plugin.aiService.updateConfig(this.plugin.settings.ai.provider)
                        this.display()
                    })
            })

        // API Key
        new Setting(containerEl)
            .setName('API key')
            .setDesc(
                this.plugin.settings.ai.provider.type === 'openrouter'
                    ? 'Your OpenRouter API key (from openrouter.ai/keys)'
                    : 'Your OpenAI API key (from platform.openai.com)'
            )
            .addText((text) => {
                text.setPlaceholder('sk-...')
                    .setValue(this.plugin.settings.ai.provider.apiKey)
                    .onChange(async (value) => {
                        await this.plugin.updateSettings(
                            (draft) => {
                                draft.ai.provider.apiKey = value
                            },
                            { type: 'ai-settings-changed' }
                        )
                        this.plugin.aiService.updateConfig(this.plugin.settings.ai.provider)
                    })
                text.inputEl.type = 'password'
                text.inputEl.classList.add('lt-api-key-input')
            })

        // Model Selection
        const providerType = this.plugin.settings.ai.provider.type
        const models = AI_MODELS[providerType] ?? []

        new Setting(containerEl)
            .setName('Model')
            .setDesc('Select or type a model identifier')
            .addDropdown((dropdown) => {
                const options: Record<string, string> = {}
                for (const model of models) {
                    options[model.id] = model.label
                }
                // Add current model if not in the list (custom model)
                const currentModel = this.plugin.settings.ai.provider.model
                if (currentModel && !options[currentModel]) {
                    options[currentModel] = currentModel
                }
                dropdown
                    .addOptions(options)
                    .setValue(currentModel)
                    .onChange(async (value) => {
                        await this.plugin.updateSettings(
                            (draft) => {
                                draft.ai.provider.model = value
                            },
                            { type: 'ai-settings-changed' }
                        )
                        this.plugin.aiService.updateConfig(this.plugin.settings.ai.provider)
                    })
            })
            .addText((text) => {
                text.setPlaceholder('Custom model ID')
                    .setValue('')
                    .onChange(async (value) => {
                        if (value.trim()) {
                            await this.plugin.updateSettings(
                                (draft) => {
                                    draft.ai.provider.model = value.trim()
                                },
                                { type: 'ai-settings-changed' }
                            )
                            this.plugin.aiService.updateConfig(this.plugin.settings.ai.provider)
                        }
                    })
                text.inputEl.classList.add('lt-custom-model-input')
                text.inputEl.placeholder = 'Or type custom model ID'
            })

        // Custom base URL
        new Setting(containerEl)
            .setName('Custom base URL')
            .setDesc('Override the API endpoint (leave empty for default)')
            .addText((text) => {
                text.setPlaceholder(
                    providerType === 'openrouter'
                        ? 'https://openrouter.ai/api/v1'
                        : 'https://api.openai.com/v1'
                )
                    .setValue(this.plugin.settings.ai.provider.baseUrl)
                    .onChange(async (value) => {
                        await this.plugin.updateSettings(
                            (draft) => {
                                draft.ai.provider.baseUrl = value
                            },
                            { type: 'ai-settings-changed' }
                        )
                        this.plugin.aiService.updateConfig(this.plugin.settings.ai.provider)
                    })
            })

        // Test Connection
        new Setting(containerEl)
            .setName('Connection')
            .setDesc('Test your AI provider connection')
            .addButton((button) => {
                button
                    .setButtonText('Test connection')
                    .setIcon('refresh-cw')
                    .onClick(async () => {
                        try {
                            button.setDisabled(true)
                            button.setButtonText('Testing...')
                            new Notice('Testing AI connection...')

                            const result = await this.plugin.aiService.testConnection()

                            if (result.success) {
                                new Notice(`AI connection successful (${result.model})`)
                            } else {
                                new Notice(
                                    `AI connection failed: ${result.error ?? 'Unknown error'}`
                                )
                            }
                        } catch (error) {
                            const msg = error instanceof Error ? error.message : 'Unknown error'
                            new Notice(`AI connection error: ${msg}`)
                        } finally {
                            button.setDisabled(false)
                            button.setButtonText('Test connection')
                        }
                    })
            })

        // Separator
        containerEl.createEl('hr', { cls: 'lt-settings-separator' })

        // Capture Analysis Settings
        new Setting(containerEl).setName('Capture analysis').setHeading()

        new Setting(containerEl)
            .setName('Analyze after capture')
            .setDesc(
                'Automatically send captured fields to AI for analysis when you finish a capture session'
            )
            .addToggle((toggle) => {
                toggle
                    .setValue(this.plugin.settings.ai.analyzeAfterCapture)
                    .onChange(async (value) => {
                        await this.plugin.updateSettings(
                            (draft) => {
                                draft.ai.analyzeAfterCapture = value
                            },
                            { type: 'ai-settings-changed' }
                        )
                    })
            })

        new Setting(containerEl)
            .setName('Capture analysis prompt')
            .setDesc(
                'Custom system prompt for capture analysis. Leave empty for the default prompt.'
            )
            .addTextArea((textarea) => {
                textarea
                    .setPlaceholder(
                        'You are a life tracking analyst. Analyze the following data and provide insights...'
                    )
                    .setValue(this.plugin.settings.ai.captureAnalysisPrompt)
                    .onChange(async (value) => {
                        await this.plugin.updateSettings(
                            (draft) => {
                                draft.ai.captureAnalysisPrompt = value
                            },
                            { type: 'ai-settings-changed' }
                        )
                    })
                textarea.inputEl.rows = 4
                textarea.inputEl.classList.add('lt-ai-prompt-input')
            })

        // Separator
        containerEl.createEl('hr', { cls: 'lt-settings-separator' })

        // Auto-save reports
        new Setting(containerEl).setName('Report saving').setHeading()

        new Setting(containerEl)
            .setName('Auto-save reports to current note')
            .setDesc(
                'Automatically append AI-generated reports to the currently open note when generated. The report is added at the end of the file.'
            )
            .addToggle((toggle) => {
                toggle.setValue(this.plugin.settings.ai.autoSaveToNote).onChange(async (value) => {
                    await this.plugin.updateSettings(
                        (draft) => {
                            draft.ai.autoSaveToNote = value
                        },
                        { type: 'ai-settings-changed' }
                    )
                })
            })

        new Setting(containerEl)
            .setName('Also save reports to folder')
            .setDesc('Additionally save each AI report as a separate note in a dedicated folder.')
            .addToggle((toggle) => {
                toggle.setValue(this.plugin.settings.ai.saveToFolder).onChange(async (value) => {
                    await this.plugin.updateSettings(
                        (draft) => {
                            draft.ai.saveToFolder = value
                        },
                        { type: 'ai-settings-changed' }
                    )
                    // Re-render to show/hide folder path setting
                    this.display()
                })
            })

        if (this.plugin.settings.ai.saveToFolder) {
            new Setting(containerEl)
                .setName('Reports folder path')
                .setDesc('Folder where separate report notes are saved.')
                .addText((text) => {
                    text.setPlaceholder('Life Tracker Reports')
                        .setValue(this.plugin.settings.ai.reportFolderPath)
                        .onChange(async (value) => {
                            await this.plugin.updateSettings(
                                (draft) => {
                                    draft.ai.reportFolderPath = value
                                },
                                { type: 'ai-settings-changed' }
                            )
                        })
                })
        }

        // Separator
        containerEl.createEl('hr', { cls: 'lt-settings-separator' })

        // Daily Summary Settings
        new Setting(containerEl).setName('Daily summary').setHeading()

        new Setting(containerEl)
            .setName('Filter tag')
            .setDesc(
                'Only include notes with this tag in daily summaries (without #). Leave empty for all notes.'
            )
            .addText((text) => {
                text.setPlaceholder('e.g., daily')
                    .setValue(this.plugin.settings.ai.dailySummary.filterTag)
                    .onChange(async (value) => {
                        await this.plugin.updateSettings(
                            (draft) => {
                                draft.ai.dailySummary.filterTag = value
                            },
                            { type: 'ai-settings-changed' }
                        )
                    })
            })

        new Setting(containerEl)
            .setName('Default date range')
            .setDesc('Default time period for daily summaries')
            .addDropdown((dropdown) => {
                const options: Record<string, string> = {}
                for (const [key, label] of Object.entries(DAILY_SUMMARY_DATE_RANGE_LABELS)) {
                    options[key] = label
                }
                dropdown
                    .addOptions(options)
                    .setValue(this.plugin.settings.ai.dailySummary.defaultDateRange)
                    .onChange(async (value) => {
                        await this.plugin.updateSettings(
                            (draft) => {
                                draft.ai.dailySummary.defaultDateRange =
                                    value as DailySummaryDateRange
                            },
                            { type: 'ai-settings-changed' }
                        )
                    })
            })

        new Setting(containerEl)
            .setName('Include CSV data')
            .setDesc('Include raw CSV data in the AI prompt for detailed analysis')
            .addToggle((toggle) => {
                toggle
                    .setValue(this.plugin.settings.ai.dailySummary.includeCsvData)
                    .onChange(async (value) => {
                        await this.plugin.updateSettings(
                            (draft) => {
                                draft.ai.dailySummary.includeCsvData = value
                            },
                            { type: 'ai-settings-changed' }
                        )
                    })
            })

        new Setting(containerEl)
            .setName('Include properties')
            .setDesc(
                'Comma-separated list of property names to include. Leave empty to auto-include all numeric and boolean properties.'
            )
            .addTextArea((textarea) => {
                textarea
                    .setPlaceholder('sleep, mood, energy, exercise')
                    .setValue(this.plugin.settings.ai.dailySummary.includeProperties.join(', '))
                    .onChange(async (value) => {
                        await this.plugin.updateSettings(
                            (draft) => {
                                draft.ai.dailySummary.includeProperties = value
                                    .split(',')
                                    .map((v) => v.trim())
                                    .filter(Boolean)
                            },
                            { type: 'ai-settings-changed' }
                        )
                    })
                textarea.inputEl.rows = 2
            })

        new Setting(containerEl)
            .setName('Daily summary prompt')
            .setDesc('Custom system prompt for daily summary. Leave empty for the default prompt.')
            .addTextArea((textarea) => {
                textarea
                    .setPlaceholder(
                        'You are a life tracking analyst. Analyze the daily data and provide a summary with accomplishments, pending tasks, and recommendations...'
                    )
                    .setValue(this.plugin.settings.ai.dailySummaryPrompt)
                    .onChange(async (value) => {
                        await this.plugin.updateSettings(
                            (draft) => {
                                draft.ai.dailySummaryPrompt = value
                            },
                            { type: 'ai-settings-changed' }
                        )
                    })
                textarea.inputEl.rows = 4
                textarea.inputEl.classList.add('lt-ai-prompt-input')
            })

        // Separator
        containerEl.createEl('hr', { cls: 'lt-settings-separator' })

        // Weekly Summary Settings
        new Setting(containerEl).setName('Weekly summary').setHeading()

        new Setting(containerEl)
            .setName('Filter tag')
            .setDesc(
                'Only include notes with this tag in weekly summaries (without #). Leave empty for all notes.'
            )
            .addText((text) => {
                text.setPlaceholder('e.g., daily')
                    .setValue(this.plugin.settings.ai.weeklySummary.filterTag)
                    .onChange(async (value) => {
                        await this.plugin.updateSettings(
                            (draft) => {
                                draft.ai.weeklySummary.filterTag = value
                            },
                            { type: 'ai-settings-changed' }
                        )
                    })
            })

        new Setting(containerEl)
            .setName('Default date range')
            .setDesc('Default time period for weekly summaries')
            .addDropdown((dropdown) => {
                const options: Record<string, string> = {}
                for (const [key, label] of Object.entries(WEEKLY_SUMMARY_DATE_RANGE_LABELS)) {
                    options[key] = label
                }
                dropdown
                    .addOptions(options)
                    .setValue(this.plugin.settings.ai.weeklySummary.defaultDateRange)
                    .onChange(async (value) => {
                        await this.plugin.updateSettings(
                            (draft) => {
                                draft.ai.weeklySummary.defaultDateRange =
                                    value as WeeklySummaryDateRange
                            },
                            { type: 'ai-settings-changed' }
                        )
                    })
            })

        new Setting(containerEl)
            .setName('Include CSV data')
            .setDesc('Include raw CSV data in the AI prompt for detailed analysis')
            .addToggle((toggle) => {
                toggle
                    .setValue(this.plugin.settings.ai.weeklySummary.includeCsvData)
                    .onChange(async (value) => {
                        await this.plugin.updateSettings(
                            (draft) => {
                                draft.ai.weeklySummary.includeCsvData = value
                            },
                            { type: 'ai-settings-changed' }
                        )
                    })
            })

        new Setting(containerEl)
            .setName('Include properties')
            .setDesc(
                'Comma-separated list of property names to include. Leave empty to auto-include all numeric and boolean properties.'
            )
            .addTextArea((textarea) => {
                textarea
                    .setPlaceholder('sleep, mood, energy, exercise')
                    .setValue(this.plugin.settings.ai.weeklySummary.includeProperties.join(', '))
                    .onChange(async (value) => {
                        await this.plugin.updateSettings(
                            (draft) => {
                                draft.ai.weeklySummary.includeProperties = value
                                    .split(',')
                                    .map((v) => v.trim())
                                    .filter(Boolean)
                            },
                            { type: 'ai-settings-changed' }
                        )
                    })
                textarea.inputEl.rows = 2
            })

        new Setting(containerEl)
            .setName('Weekly summary prompt')
            .setDesc('Custom system prompt for weekly summary. Leave empty for the default prompt.')
            .addTextArea((textarea) => {
                textarea
                    .setPlaceholder(
                        'You are a life tracking analyst. Analyze the weekly data and provide a summary with trends, patterns, and recommendations...'
                    )
                    .setValue(this.plugin.settings.ai.weeklySummaryPrompt)
                    .onChange(async (value) => {
                        await this.plugin.updateSettings(
                            (draft) => {
                                draft.ai.weeklySummaryPrompt = value
                            },
                            { type: 'ai-settings-changed' }
                        )
                    })
                textarea.inputEl.rows = 4
                textarea.inputEl.classList.add('lt-ai-prompt-input')
            })

        // Separator
        containerEl.createEl('hr', { cls: 'lt-settings-separator' })

        // Monthly Summary Settings
        new Setting(containerEl).setName('Monthly summary').setHeading()

        new Setting(containerEl)
            .setName('Filter tag')
            .setDesc(
                'Only include notes with this tag in monthly summaries (without #). Leave empty for all notes.'
            )
            .addText((text) => {
                text.setPlaceholder('e.g., daily')
                    .setValue(this.plugin.settings.ai.monthlySummary.filterTag)
                    .onChange(async (value) => {
                        await this.plugin.updateSettings(
                            (draft) => {
                                draft.ai.monthlySummary.filterTag = value
                            },
                            { type: 'ai-settings-changed' }
                        )
                    })
            })

        new Setting(containerEl)
            .setName('Default date range')
            .setDesc('Default time period for monthly summaries')
            .addDropdown((dropdown) => {
                const options: Record<string, string> = {}
                for (const [key, label] of Object.entries(MONTHLY_SUMMARY_DATE_RANGE_LABELS)) {
                    options[key] = label
                }
                dropdown
                    .addOptions(options)
                    .setValue(this.plugin.settings.ai.monthlySummary.defaultDateRange)
                    .onChange(async (value) => {
                        await this.plugin.updateSettings(
                            (draft) => {
                                draft.ai.monthlySummary.defaultDateRange =
                                    value as MonthlySummaryDateRange
                            },
                            { type: 'ai-settings-changed' }
                        )
                    })
            })

        new Setting(containerEl)
            .setName('Include CSV data')
            .setDesc('Include raw CSV data in the AI prompt for detailed analysis')
            .addToggle((toggle) => {
                toggle
                    .setValue(this.plugin.settings.ai.monthlySummary.includeCsvData)
                    .onChange(async (value) => {
                        await this.plugin.updateSettings(
                            (draft) => {
                                draft.ai.monthlySummary.includeCsvData = value
                            },
                            { type: 'ai-settings-changed' }
                        )
                    })
            })

        new Setting(containerEl)
            .setName('Include properties')
            .setDesc(
                'Comma-separated list of property names to include. Leave empty to auto-include all numeric and boolean properties.'
            )
            .addTextArea((textarea) => {
                textarea
                    .setPlaceholder('sleep, mood, energy, exercise')
                    .setValue(this.plugin.settings.ai.monthlySummary.includeProperties.join(', '))
                    .onChange(async (value) => {
                        await this.plugin.updateSettings(
                            (draft) => {
                                draft.ai.monthlySummary.includeProperties = value
                                    .split(',')
                                    .map((v) => v.trim())
                                    .filter(Boolean)
                            },
                            { type: 'ai-settings-changed' }
                        )
                    })
                textarea.inputEl.rows = 2
            })

        new Setting(containerEl)
            .setName('Monthly summary prompt')
            .setDesc(
                'Custom system prompt for monthly summary. Leave empty for the default prompt.'
            )
            .addTextArea((textarea) => {
                textarea
                    .setPlaceholder(
                        'You are a life tracking analyst. Analyze the monthly data and provide a summary with trends, patterns, and recommendations...'
                    )
                    .setValue(this.plugin.settings.ai.monthlySummaryPrompt)
                    .onChange(async (value) => {
                        await this.plugin.updateSettings(
                            (draft) => {
                                draft.ai.monthlySummaryPrompt = value
                            },
                            { type: 'ai-settings-changed' }
                        )
                    })
                textarea.inputEl.rows = 4
                textarea.inputEl.classList.add('lt-ai-prompt-input')
            })
    }

    // ========================================
    // HCGateway Integration Section (within Integrations Tab)
    // ========================================

    private renderHCGatewayIntegration(containerEl: HTMLElement): void {
        new Setting(containerEl).setName('Health Connect (HCGateway)').setHeading()

        const hcDesc = new DocumentFragment()
        hcDesc.createDiv({
            text: 'Connect to HCGateway to import health data from Android Health Connect. Requires the HCGateway server running on your network.'
        })
        new Setting(containerEl).setDesc(hcDesc)

        // Enable/Disable Toggle
        new Setting(containerEl)
            .setName('Enable HCGateway integration')
            .setDesc('Connect to HCGateway for health data synchronization during capture')
            .addToggle((toggle) => {
                toggle.setValue(this.plugin.settings.hcgateway.enabled).onChange(async (value) => {
                    await this.plugin.updateSettings((draft) => {
                        draft.hcgateway.enabled = value
                    })
                    this.display()
                })
            })

        if (!this.plugin.settings.hcgateway.enabled) return

        // Server URL
        new Setting(containerEl)
            .setName('Server URL')
            .setDesc('HCGateway server base URL')
            .addText((text) => {
                text.setPlaceholder('http://localhost:6644')
                    .setValue(this.plugin.settings.hcgateway.baseUrl)
                    .onChange(async (value) => {
                        await this.plugin.updateSettings((draft) => {
                            draft.hcgateway.baseUrl = value.trim() || 'http://localhost:6644'
                        })
                        this.plugin.hcGatewayAPI.setBaseUrl(value.trim() || 'http://localhost:6644')
                    })
            })

        // Username
        new Setting(containerEl)
            .setName('Username')
            .setDesc('Your HCGateway username')
            .addText((text) => {
                text.setPlaceholder('username')
                    .setValue(this.plugin.settings.hcgateway.username)
                    .onChange(async (value) => {
                        await this.plugin.updateSettings((draft) => {
                            draft.hcgateway.username = value
                        })
                    })
            })

        // Password — saved to settings so capture can log in automatically
        new Setting(containerEl)
            .setName('Password')
            .setDesc('Saved to settings so the plugin can log in automatically during capture.')
            .addText((text) => {
                text.setPlaceholder('Enter password')
                    .setValue(this.plugin.settings.hcgateway.password)
                    .onChange(async (value) => {
                        await this.plugin.updateSettings((draft) => {
                            draft.hcgateway.password = value
                        })
                    })
                text.inputEl.type = 'password'
            })

        // Test Connection Button
        new Setting(containerEl)
            .setName('Connection')
            .setDesc('Test your HCGateway connection with stored credentials')
            .addButton((button) => {
                button
                    .setButtonText('Test connection')
                    .setIcon('refresh-cw')
                    .onClick(async () => {
                        try {
                            button.setDisabled(true)
                            button.setButtonText('Testing...')
                            button.buttonEl.style.color = ''

                            const username = this.plugin.settings.hcgateway.username
                            const password = this.plugin.settings.hcgateway.password

                            if (!username || !password) {
                                new Notice('HCGateway: please enter both username and password')
                                return
                            }

                            new Notice('Testing HCGateway connection...')

                            const loginSuccess = await this.plugin.hcGatewayAuthService.login(
                                username,
                                password
                            )

                            if (loginSuccess) {
                                button.buttonEl.style.color = 'var(--text-success)'
                                new Notice('HCGateway: connection successful!')
                            } else {
                                button.buttonEl.style.color = 'var(--text-error)'
                                const state = this.plugin.hcGatewayAuthService.getState()
                                new Notice(
                                    `HCGateway: connection failed — ${state.lastError ?? 'Unknown error'}`
                                )
                            }
                        } catch (error) {
                            console.error('HCGateway connection test failed:', error)
                            const msg = error instanceof Error ? error.message : 'Unknown error'
                            new Notice(`HCGateway: connection error — ${msg}`)
                            button.buttonEl.style.color = 'var(--text-error)'
                        } finally {
                            button.setDisabled(false)
                            button.setButtonText('Test connection')
                        }
                    })
            })

        // Separator before sync settings
        containerEl.createEl('hr', { cls: 'lt-settings-separator' })

        // Property prefix
        new Setting(containerEl)
            .setName('Property prefix')
            .setDesc(
                'Prefix for frontmatter properties (e.g., "health" creates "health_steps", "health_heart_rate")'
            )
            .addText((text) => {
                text.setPlaceholder('health')
                    .setValue(this.plugin.settings.hcgateway.propertyPrefix)
                    .onChange(async (value) => {
                        await this.plugin.updateSettings((draft) => {
                            draft.hcgateway.propertyPrefix = value.trim()
                        })
                    })
            })

        // Timezone
        new Setting(containerEl)
            .setName('Timezone')
            .setDesc(
                'IANA timezone for date boundary queries (e.g., "Asia/Almaty", "Europe/London"). Ensures correct day boundaries when fetching health data.'
            )
            .addText((text) => {
                text.setPlaceholder('Asia/Almaty')
                    .setValue(this.plugin.settings.hcgateway.timeZone)
                    .onChange(async (value) => {
                        await this.plugin.updateSettings((draft) => {
                            draft.hcgateway.timeZone = value.trim() || 'Asia/Almaty'
                        })
                    })
            })

        // Data types section
        containerEl.createEl('hr', { cls: 'lt-settings-separator' })
        new Setting(containerEl).setName('Data types to sync').setHeading()

        const dataTypesDesc = new DocumentFragment()
        dataTypesDesc.createDiv({
            text: 'Select which health data types to fetch during capture. When all are disabled, all types will be fetched.'
        })
        new Setting(containerEl).setDesc(dataTypesDesc)

        // Render category-grouped toggles
        const enabledSet = new Set(this.plugin.settings.hcgateway.enabledDataTypes)

        for (const [category, dataTypes] of Object.entries(HCGATEWAY_DATA_TYPE_CATEGORIES)) {
            // Category heading
            new Setting(containerEl).setName(category).setHeading()

            for (const dataType of dataTypes) {
                const label = HCGATEWAY_DATA_TYPE_LABELS[dataType]
                // When enabledDataTypes is empty, all types are considered enabled (default)
                const isEnabled = enabledSet.size === 0 || enabledSet.has(dataType)

                new Setting(containerEl).setName(label).addToggle((toggle) => {
                    toggle.setValue(isEnabled).onChange(async (value) => {
                        await this.plugin.updateSettings((draft) => {
                            const currentEnabled = new Set(draft.hcgateway.enabledDataTypes)

                            if (currentEnabled.size === 0 && !value) {
                                // Transitioning from "all enabled" to disabling one:
                                // Add all types except the one being disabled
                                const allTypes = Object.keys(
                                    HCGATEWAY_DATA_TYPE_LABELS
                                ) as HCGatewayDataType[]
                                draft.hcgateway.enabledDataTypes = allTypes.filter(
                                    (dt) => dt !== dataType
                                )
                            } else if (value) {
                                currentEnabled.add(dataType)
                                draft.hcgateway.enabledDataTypes = [...currentEnabled]
                                // If all types are now enabled, clear the array (means "all")
                                const allTypes = Object.keys(
                                    HCGATEWAY_DATA_TYPE_LABELS
                                ) as HCGatewayDataType[]
                                if (allTypes.every((dt) => currentEnabled.has(dt))) {
                                    draft.hcgateway.enabledDataTypes = []
                                }
                            } else {
                                currentEnabled.delete(dataType)
                                draft.hcgateway.enabledDataTypes = [...currentEnabled]
                            }
                        })
                    })
                })
            }
        }
    }

    // ========================================
    // About Tab
    // ========================================

    private renderAboutTab(containerEl: HTMLElement): void {
        new Setting(containerEl)
            .setName('Follow me on X')
            .setDesc('Sébastien Dubois (@dSebastien)')
            .addButton((button) => {
                button.setCta()
                button.setButtonText('Follow me on X').onClick(() => {
                    window.open('https://x.com/dSebastien')
                })
            })

        new Setting(containerEl).setName('Support').setHeading()

        const supportDesc = new DocumentFragment()
        supportDesc.createDiv({
            text: 'Buy me a coffee to support the development of this plugin'
        })

        new Setting(containerEl).setDesc(supportDesc)

        this.renderBuyMeACoffeeBadge(containerEl)
    }

    private renderBuyMeACoffeeBadge(contentEl: HTMLElement | DocumentFragment, width = 175): void {
        const linkEl = contentEl.createEl('a', {
            href: 'https://www.buymeacoffee.com/dsebastien'
        })
        const imgEl = linkEl.createEl('img')
        imgEl.src =
            'https://github.com/dsebastien/obsidian-plugin-template/blob/main/src/assets/buy-me-a-coffee.png?raw=true'
        imgEl.alt = 'Buy me a coffee'
        imgEl.width = width
    }
}
