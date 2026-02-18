import { Modal, type TFile } from 'obsidian'
import type { LifeTrackerPlugin } from '../../plugin'
import type { PropertyDefinition, PropertyEditor } from '../../types'
import { FrontmatterService } from '../../services/frontmatter.service'
import { PropertyRecognitionService } from '../../services/property-recognition.service'
import { createPropertyEditor } from '../editing/property-editor'
import { formatFileTitleWithWeekday, log } from '../../../utils'

/** Debounce delay for auto-save in milliseconds */
const AUTO_SAVE_DEBOUNCE_MS = 500

/**
 * An editor entry tracking a single property's editor instance and its debounce timer.
 */
interface EditorEntry {
    definition: PropertyDefinition
    editor: PropertyEditor
    value: unknown
    saveTimer: ReturnType<typeof setTimeout> | null
}

/**
 * Modal that displays ALL applicable property fields at once for a single note.
 * Designed for filling in fields throughout the day without carousel navigation.
 * Auto-saves each field independently with debounce.
 */
export class DailyNoteModal extends Modal {
    private plugin: LifeTrackerPlugin
    private file: TFile
    private frontmatterService: FrontmatterService
    private recognitionService: PropertyRecognitionService

    private editors: EditorEntry[] = []
    private sortedDefinitions: PropertyDefinition[] = []
    private savedValues: Record<string, unknown> = {}

    constructor(plugin: LifeTrackerPlugin, file: TFile) {
        super(plugin.app)
        this.plugin = plugin
        this.file = file
        this.frontmatterService = new FrontmatterService(plugin.app)
        this.recognitionService = new PropertyRecognitionService(plugin.app)
    }

    override onOpen(): void {
        const { contentEl } = this
        contentEl.empty()
        contentEl.addClass('lt-daily-modal')

        this.loadProperties()

        if (this.sortedDefinitions.length === 0) {
            this.renderEmptyState()
            return
        }

        this.render()
    }

    override onClose(): void {
        // Flush all pending saves
        for (const entry of this.editors) {
            if (entry.saveTimer) {
                clearTimeout(entry.saveTimer)
                void this.saveProperty(entry)
            }
            entry.editor.destroy()
        }
        this.editors = []
        this.contentEl.empty()
    }

    /**
     * Load property definitions and existing values for the file.
     */
    private loadProperties(): void {
        const allDefinitions = this.plugin.settings.propertyDefinitions
        this.sortedDefinitions = this.recognitionService.getApplicableProperties(
            this.file,
            allDefinitions
        )
        this.savedValues = this.frontmatterService.readDefinedProperties(
            this.file,
            this.sortedDefinitions
        )
    }

    /**
     * Render the full form view with all fields visible.
     */
    private render(): void {
        const { contentEl } = this
        contentEl.empty()
        this.editors = []

        const wrapper = contentEl.createDiv({ cls: 'lt-daily-container' })

        // Title
        const title = formatFileTitleWithWeekday(this.file.basename)
        wrapper.createDiv({
            cls: 'lt-daily-title',
            text: title
        })

        // Subtitle
        wrapper.createDiv({
            cls: 'lt-daily-subtitle',
            text: 'Fill in fields throughout the day. Changes are saved automatically.'
        })

        // Fields list
        const fieldsEl = wrapper.createDiv({ cls: 'lt-daily-fields' })

        for (const definition of this.sortedDefinitions) {
            this.renderField(fieldsEl, definition)
        }
    }

    /**
     * Render a single property field row.
     */
    private renderField(container: HTMLElement, definition: PropertyDefinition): void {
        const fieldEl = container.createDiv({ cls: 'lt-daily-field' })

        // Label row
        const labelRow = fieldEl.createDiv({ cls: 'lt-daily-field-label' })
        labelRow.createSpan({
            cls: 'lt-daily-field-name',
            text: definition.displayName || definition.name
        })
        if (definition.required) {
            labelRow.createSpan({
                cls: 'lt-daily-field-required',
                text: 'Required'
            })
        }

        // Description
        if (definition.description) {
            fieldEl.createDiv({
                cls: 'lt-daily-field-description',
                text: definition.description
            })
        }

        // Editor
        const editorContainer = fieldEl.createDiv({ cls: 'lt-daily-field-editor' })
        const value = this.savedValues[definition.name]

        const entry: EditorEntry = {
            definition,
            // Temporarily null, assigned immediately below after editor creation
            editor: null as unknown as PropertyEditor,
            value,
            saveTimer: null
        }

        const editor = createPropertyEditor({
            definition,
            value,
            onChange: (newValue) => {
                entry.value = newValue
                this.debouncedSaveField(entry)
            },
            onCommit: () => {
                void this.saveProperty(entry)
            },
            onEnterKey: () => {
                // Move focus to next field
                this.focusNextField(entry)
            }
        })

        entry.editor = editor
        editor.render(editorContainer)

        // "Use default" button if default is configured
        if (definition.defaultValue !== null) {
            this.injectDefaultButton(editorContainer, definition, entry)
        }

        this.editors.push(entry)
    }

    /**
     * Inject "Use default" button into the editor container.
     */
    private injectDefaultButton(
        editorContainer: HTMLElement,
        definition: PropertyDefinition,
        entry: EditorEntry
    ): void {
        const numberWrapper = editorContainer.querySelector('.lt-editor-number-wrapper')

        if (numberWrapper) {
            const inputWrapper = numberWrapper.createDiv({ cls: 'lt-daily-input-with-default' })
            const numberInput = numberWrapper.querySelector('.lt-editor-input--number')
            if (numberInput) {
                inputWrapper.appendChild(numberInput)
            }
            const btn = inputWrapper.createEl('button', {
                cls: 'lt-daily-default-btn',
                text: 'Default'
            })
            btn.addEventListener('click', () => {
                entry.value = definition.defaultValue
                entry.editor.setValue(definition.defaultValue)
                void this.saveProperty(entry)
            })
        } else {
            const input = editorContainer.querySelector(
                '.lt-editor-input, .lt-editor-select, .lt-editor-toggle, .lt-editor-list'
            )
            if (input) {
                const inputWrapper = document.createElement('div')
                inputWrapper.className = 'lt-daily-input-with-default'
                input.parentNode?.insertBefore(inputWrapper, input)
                inputWrapper.appendChild(input)
                const btn = inputWrapper.createEl('button', {
                    cls: 'lt-daily-default-btn',
                    text: 'Default'
                })
                btn.addEventListener('click', () => {
                    entry.value = definition.defaultValue
                    entry.editor.setValue(definition.defaultValue)
                    void this.saveProperty(entry)
                })
            }
        }
    }

    /**
     * Debounced save for a specific field.
     */
    private debouncedSaveField(entry: EditorEntry): void {
        if (entry.saveTimer) {
            clearTimeout(entry.saveTimer)
        }
        entry.saveTimer = setTimeout(() => {
            void this.saveProperty(entry)
        }, AUTO_SAVE_DEBOUNCE_MS)
    }

    /**
     * Immediately save a property value to frontmatter.
     */
    private async saveProperty(entry: EditorEntry): Promise<void> {
        if (entry.saveTimer) {
            clearTimeout(entry.saveTimer)
            entry.saveTimer = null
        }

        this.savedValues[entry.definition.name] = entry.value

        try {
            await this.frontmatterService.write(this.file, {
                [entry.definition.name]: entry.value
            })
        } catch (error) {
            log(`Failed to save property ${entry.definition.name}`, 'error', error)
            console.error('Failed to save property:', error)
        }
    }

    /**
     * Focus the next field in the form.
     */
    private focusNextField(currentEntry: EditorEntry): void {
        const currentIndex = this.editors.indexOf(currentEntry)
        const nextEntry = this.editors[currentIndex + 1]
        if (nextEntry) {
            nextEntry.editor.focus()
        }
    }

    /**
     * Render empty state when no properties apply to this file.
     */
    private renderEmptyState(): void {
        const { contentEl } = this
        contentEl.empty()

        const allDefinitions = this.plugin.settings.propertyDefinitions

        const emptyEl = contentEl.createDiv({ cls: 'lt-daily-empty' })

        if (allDefinitions.length === 0) {
            emptyEl.createDiv({ cls: 'lt-daily-empty-icon', text: '\uD83D\uDCDD' })
            emptyEl.createDiv({
                cls: 'lt-daily-empty-title',
                text: 'No property definitions'
            })
            emptyEl.createDiv({
                cls: 'lt-daily-empty-text',
                text: 'Add property definitions in Settings \u2192 Life Tracker \u2192 Property definitions.'
            })
        } else {
            emptyEl.createDiv({ cls: 'lt-daily-empty-icon', text: '\uD83D\uDD0D' })
            emptyEl.createDiv({
                cls: 'lt-daily-empty-title',
                text: 'No matching properties'
            })
            emptyEl.createDiv({
                cls: 'lt-daily-empty-text',
                text: `No property definitions apply to "${this.file.basename}". Check your note filtering settings.`
            })
        }

        const closeBtn = emptyEl.createEl('button', {
            cls: 'lt-daily-btn lt-daily-btn--secondary',
            text: 'Close'
        })
        closeBtn.addEventListener('click', () => this.close())
    }
}
