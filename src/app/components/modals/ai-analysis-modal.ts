import { MarkdownRenderer, Modal, Notice, normalizePath } from 'obsidian'
import type { LifeTrackerPlugin } from '../../plugin'
import type { AIAnalysisResult } from '../../types'
import { AI_PROVIDER_LABELS } from '../../types'
import { formatDateISO } from '../../../utils/date.utils'
import { log } from '../../../utils'

/**
 * Modal to display AI analysis results.
 * Renders markdown content with a header showing provider info.
 * Auto-saves to note when the setting is enabled.
 */
export class AIAnalysisModal extends Modal {
    private plugin: LifeTrackerPlugin
    private result: AIAnalysisResult
    private title: string

    constructor(plugin: LifeTrackerPlugin, result: AIAnalysisResult, title: string) {
        super(plugin.app)
        this.plugin = plugin
        this.result = result
        this.title = title
    }

    override onOpen(): void {
        const { contentEl } = this
        contentEl.empty()
        contentEl.addClass('lt-ai-analysis-modal')

        // Title
        contentEl.createDiv({
            cls: 'lt-ai-analysis-title',
            text: this.title
        })

        if (!this.result.success) {
            this.renderError()
            return
        }

        // Provider info badge
        const providerLabel = AI_PROVIDER_LABELS[this.result.provider]
        const infoBadge = contentEl.createDiv({ cls: 'lt-ai-analysis-info' })
        infoBadge.createSpan({
            cls: 'lt-ai-analysis-provider',
            text: `${providerLabel} / ${this.result.model}`
        })

        if (this.result.usage) {
            infoBadge.createSpan({
                cls: 'lt-ai-analysis-tokens',
                text: `${this.result.usage.totalTokens} tokens`
            })
        }

        // Scrollable wrapper for content area
        const scrollWrapper = contentEl.createDiv({ cls: 'lt-ai-analysis-scroll-wrapper' })

        // Content area with markdown rendering
        const contentArea = scrollWrapper.createDiv({ cls: 'lt-ai-analysis-content' })
        void MarkdownRenderer.render(
            this.plugin.app,
            this.result.content,
            contentArea,
            '',
            this.plugin
        )

        // Action buttons
        const actionsEl = contentEl.createDiv({ cls: 'lt-ai-analysis-actions' })

        // Save to note button
        const saveBtn = actionsEl.createEl('button', {
            cls: 'lt-ai-analysis-btn',
            text: 'Save to note'
        })
        saveBtn.addEventListener('click', () => {
            void this.saveToNote()
        })

        // Copy button
        const copyBtn = actionsEl.createEl('button', {
            cls: 'lt-ai-analysis-btn',
            text: 'Copy to clipboard'
        })
        copyBtn.addEventListener('click', () => {
            void navigator.clipboard.writeText(this.result.content).then(() => {
                new Notice('Analysis copied to clipboard')
            })
        })

        // Close button
        const closeBtn = actionsEl.createEl('button', {
            cls: 'lt-ai-analysis-btn lt-ai-analysis-btn--primary',
            text: 'Close'
        })
        closeBtn.addEventListener('click', () => this.close())

        // Auto-save to note if enabled
        if (this.plugin.settings.ai.autoSaveToNote) {
            void this.saveToNote().then(() => {
                log('[AIAnalysisModal] Auto-saved report to note', 'debug')
            })
        }
    }

    /**
     * Save the AI analysis result to a note in the vault.
     * Creates a new note in the "Life Tracker Reports" folder with the analysis content.
     */
    private async saveToNote(): Promise<void> {
        const folderPath = 'Life Tracker Reports'
        const dateStr = formatDateISO(new Date())
        // Sanitize title for use as filename: remove colons and special chars
        const sanitizedTitle = this.title
            .replace(/[:/\\?*"<>|]/g, '-')
            .replace(/\s+/g, ' ')
            .trim()
        const fileName = `${dateStr} - ${sanitizedTitle}.md`
        const filePath = normalizePath(`${folderPath}/${fileName}`)

        // Build note content
        const noteContent = [
            `# ${this.title}`,
            '',
            `> Generated on ${dateStr} by Life Tracker using ${AI_PROVIDER_LABELS[this.result.provider]} / ${this.result.model}`,
            '',
            this.result.content
        ].join('\n')

        try {
            // Ensure the folder exists
            const folder = this.plugin.app.vault.getAbstractFileByPath(folderPath)
            if (!folder) {
                await this.plugin.app.vault.createFolder(folderPath)
            }

            // Check if file already exists
            const existing = this.plugin.app.vault.getAbstractFileByPath(filePath)
            if (existing) {
                // Overwrite existing file
                await this.plugin.app.vault.modify(
                    existing as import('obsidian').TFile,
                    noteContent
                )
                new Notice(`Report updated: ${fileName}`)
            } else {
                // Create new file
                await this.plugin.app.vault.create(filePath, noteContent)
                new Notice(`Report saved: ${fileName}`)
            }
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error'
            new Notice(`Failed to save report: ${message}`)
        }
    }

    private renderError(): void {
        const { contentEl } = this

        const errorEl = contentEl.createDiv({ cls: 'lt-ai-analysis-error' })
        errorEl.createDiv({
            cls: 'lt-ai-analysis-error-title',
            text: 'Analysis failed'
        })
        errorEl.createDiv({
            cls: 'lt-ai-analysis-error-message',
            text: this.result.error ?? 'Unknown error'
        })

        const closeBtn = contentEl.createEl('button', {
            cls: 'lt-ai-analysis-btn lt-ai-analysis-btn--primary',
            text: 'Close'
        })
        closeBtn.addEventListener('click', () => this.close())
    }

    override onClose(): void {
        this.contentEl.empty()
    }
}
