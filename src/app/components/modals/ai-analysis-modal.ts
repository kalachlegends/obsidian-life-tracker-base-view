import { MarkdownRenderer, Modal, Notice, type TFile, normalizePath } from 'obsidian'
import type { LifeTrackerPlugin } from '../../plugin'
import type { AIAnalysisResult } from '../../types'
import { AI_PROVIDER_LABELS } from '../../types'
import { formatDateISO } from '../../../utils/date.utils'
import { log } from '../../../utils'

/**
 * Modal to display AI analysis results.
 * Renders markdown content with a header showing provider info.
 * Saves to the currently active file by default (appended at end).
 * Optionally also saves to a dedicated folder when configured.
 */
export class AIAnalysisModal extends Modal {
    private plugin: LifeTrackerPlugin
    private result: AIAnalysisResult
    private title: string
    /** The file that was active when the modal was created */
    private activeFile: TFile | null

    constructor(plugin: LifeTrackerPlugin, result: AIAnalysisResult, title: string) {
        super(plugin.app)
        this.plugin = plugin
        this.result = result
        this.title = title
        // Capture active file at construction time (before modal opens and focus changes)
        this.activeFile = plugin.app.workspace.getActiveFile()
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
     * Save the AI analysis result.
     * Always appends to the currently active file.
     * Optionally also saves to a dedicated folder when `saveToFolder` is enabled.
     */
    private async saveToNote(): Promise<void> {
        const dateStr = formatDateISO(new Date())
        const providerInfo = `${AI_PROVIDER_LABELS[this.result.provider]} / ${this.result.model}`

        // Build the content block to append
        const appendContent = [
            '',
            `## ${this.title}`,
            '',
            `> Generated on ${dateStr} by Life Tracker using ${providerInfo}`,
            '',
            this.result.content
        ].join('\n')

        // 1. Append to active file
        await this.appendToActiveFile(appendContent)

        // 2. Optionally also save to a dedicated folder
        if (this.plugin.settings.ai.saveToFolder) {
            await this.saveToFolder(dateStr, providerInfo)
        }
    }

    /**
     * Append content to the currently active file.
     */
    private async appendToActiveFile(content: string): Promise<void> {
        const file = this.activeFile
        if (!file) {
            new Notice('No active file to append report to')
            return
        }

        try {
            const existing = await this.plugin.app.vault.read(file)
            await this.plugin.app.vault.modify(file, existing + content)
            new Notice(`Report appended to ${file.basename}`)
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error'
            new Notice(`Failed to append report: ${message}`)
        }
    }

    /**
     * Save the AI analysis result as a separate note in the configured reports folder.
     */
    private async saveToFolder(dateStr: string, providerInfo: string): Promise<void> {
        const folderPath = this.plugin.settings.ai.reportFolderPath || 'Life Tracker Reports'
        const sanitizedTitle = this.title
            .replace(/[:/\\?*"<>|]/g, '-')
            .replace(/\s+/g, ' ')
            .trim()
        const fileName = `${dateStr} - ${sanitizedTitle}.md`
        const filePath = normalizePath(`${folderPath}/${fileName}`)

        const noteContent = [
            `# ${this.title}`,
            '',
            `> Generated on ${dateStr} by Life Tracker using ${providerInfo}`,
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
                await this.plugin.app.vault.modify(existing as TFile, noteContent)
                log(`[AIAnalysisModal] Report updated in folder: ${fileName}`, 'debug')
            } else {
                await this.plugin.app.vault.create(filePath, noteContent)
                log(`[AIAnalysisModal] Report saved to folder: ${fileName}`, 'debug')
            }
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error'
            new Notice(`Failed to save report to folder: ${message}`)
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
