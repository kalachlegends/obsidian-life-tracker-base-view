import { Modal, Notice, type TFile } from 'obsidian'
import type { LifeTrackerPlugin } from '../../plugin'
import { FrontmatterService } from '../../services/frontmatter.service'
import { formatFileTitleWithWeekday, log } from '../../../utils'

/** Regex to detect a `[HH:mm]` prefix on a stored thought string. */
const TIMESTAMP_RE = /^\[(\d{2}:\d{2})\]\s*/

/** Parse a stored thought into its optional timestamp and text parts. */
function parseThought(raw: string): { time: string | null; text: string } {
    const match = TIMESTAMP_RE.exec(raw)
    if (match?.[1]) {
        return { time: match[1], text: raw.slice(match[0].length) }
    }
    return { time: null, text: raw }
}

/** Return the current local time formatted as `HH:mm`. */
function currentTime(): string {
    const now = new Date()
    const hh = String(now.getHours()).padStart(2, '0')
    const mm = String(now.getMinutes()).padStart(2, '0')
    return `${hh}:${mm}`
}

/**
 * Modal for quickly capturing thoughts throughout the day.
 * Appends each thought to a list property in the note's frontmatter.
 * Shows existing thoughts and provides a textarea to add new ones.
 * Each thought is stored with a `[HH:mm]` timestamp prefix.
 */
export class ThoughtsModal extends Modal {
    private plugin: LifeTrackerPlugin
    private file: TFile
    private frontmatterService: FrontmatterService

    private thoughts: string[] = []
    private thoughtsListEl: HTMLElement | null = null
    private textareaEl: HTMLTextAreaElement | null = null

    constructor(plugin: LifeTrackerPlugin, file: TFile) {
        super(plugin.app)
        this.plugin = plugin
        this.file = file
        this.frontmatterService = new FrontmatterService(plugin.app)
    }

    override onOpen(): void {
        const { contentEl } = this
        contentEl.empty()
        contentEl.addClass('lt-thoughts-modal')

        this.loadThoughts()
        this.render()
    }

    override onClose(): void {
        this.contentEl.empty()
    }

    /**
     * Load existing thoughts from frontmatter.
     */
    private loadThoughts(): void {
        const propertyName = this.plugin.settings.thoughtsPropertyName
        const frontmatter = this.frontmatterService.read(this.file)
        const raw = frontmatter[propertyName]

        if (Array.isArray(raw)) {
            this.thoughts = raw.map(String)
        } else if (typeof raw === 'string' && raw.trim()) {
            this.thoughts = [raw]
        } else {
            this.thoughts = []
        }
    }

    /**
     * Render the modal UI.
     */
    private render(): void {
        const { contentEl } = this
        contentEl.empty()

        const wrapper = contentEl.createDiv({ cls: 'lt-thoughts-container' })

        // Title
        const title = formatFileTitleWithWeekday(this.file.basename)
        wrapper.createDiv({ cls: 'lt-thoughts-title', text: title })

        // Property name hint
        const propertyName = this.plugin.settings.thoughtsPropertyName
        wrapper.createDiv({
            cls: 'lt-thoughts-property-hint',
            text: `Storing in: ${propertyName}`
        })

        // Existing thoughts list
        this.thoughtsListEl = wrapper.createDiv({ cls: 'lt-thoughts-list' })
        this.renderThoughtsList()

        // Input area
        const inputArea = wrapper.createDiv({ cls: 'lt-thoughts-input-area' })

        this.textareaEl = inputArea.createEl('textarea', {
            cls: 'lt-thoughts-textarea',
            attr: {
                placeholder: 'Write a thought...',
                rows: '3'
            }
        })

        // Handle Ctrl/Cmd+Enter to submit
        this.textareaEl.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                e.preventDefault()
                void this.addThought()
            }
        })

        // Add button
        const addBtn = inputArea.createEl('button', {
            cls: 'lt-thoughts-add-btn',
            text: 'Add thought'
        })
        addBtn.addEventListener('click', () => {
            void this.addThought()
        })

        // Keyboard hint
        inputArea.createDiv({
            cls: 'lt-thoughts-hint',
            text: 'Ctrl+Enter to add'
        })

        // Focus textarea
        setTimeout(() => {
            this.textareaEl?.focus()
        }, 50)
    }

    /**
     * Render the list of existing thoughts.
     * Displays the `[HH:mm]` timestamp (if present) as a styled badge
     * instead of the numeric index.
     */
    private renderThoughtsList(): void {
        if (!this.thoughtsListEl) return
        this.thoughtsListEl.empty()

        if (this.thoughts.length === 0) {
            this.thoughtsListEl.createDiv({
                cls: 'lt-thoughts-empty',
                text: 'No thoughts captured yet.'
            })
            return
        }

        for (let i = 0; i < this.thoughts.length; i++) {
            const thought = this.thoughts[i]
            if (thought === undefined) continue

            const { time, text } = parseThought(thought)
            const itemEl = this.thoughtsListEl.createDiv({ cls: 'lt-thoughts-item' })

            // Time badge (or fallback to numeric index for legacy thoughts)
            if (time) {
                itemEl.createSpan({
                    cls: 'lt-thoughts-item-time',
                    text: time
                })
            } else {
                itemEl.createSpan({
                    cls: 'lt-thoughts-item-index',
                    text: `${i + 1}`
                })
            }

            // Thought text (without the timestamp prefix)
            itemEl.createSpan({
                cls: 'lt-thoughts-item-text',
                text
            })

            // Delete button
            const deleteBtn = itemEl.createEl('button', {
                cls: 'lt-thoughts-item-delete',
                attr: { 'aria-label': 'Remove thought' }
            })
            deleteBtn.textContent = '\u00D7'
            deleteBtn.addEventListener('click', () => {
                void this.removeThought(i)
            })
        }
    }

    /**
     * Add a new thought from the textarea.
     * Prepends a `[HH:mm]` timestamp to the stored value.
     */
    private async addThought(): Promise<void> {
        if (!this.textareaEl) return

        const text = this.textareaEl.value.trim()
        if (!text) {
            new Notice('Please enter a thought first')
            return
        }

        const stamped = `[${currentTime()}] ${text}`
        this.thoughts.push(stamped)
        this.textareaEl.value = ''

        await this.saveThoughts()
        this.renderThoughtsList()
        this.textareaEl.focus()
    }

    /**
     * Remove a thought by index.
     */
    private async removeThought(index: number): Promise<void> {
        this.thoughts.splice(index, 1)
        await this.saveThoughts()
        this.renderThoughtsList()
    }

    /**
     * Save all thoughts to frontmatter.
     */
    private async saveThoughts(): Promise<void> {
        const propertyName = this.plugin.settings.thoughtsPropertyName

        try {
            // Write empty array as null to remove the property when no thoughts
            const value = this.thoughts.length > 0 ? [...this.thoughts] : null
            await this.frontmatterService.write(this.file, {
                [propertyName]: value
            })
        } catch (error) {
            log(`Failed to save thoughts`, 'error', error)
            console.error('Failed to save thoughts:', error)
            new Notice('Failed to save thought')
        }
    }
}
