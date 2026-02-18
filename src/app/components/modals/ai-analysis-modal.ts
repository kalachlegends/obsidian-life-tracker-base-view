import { MarkdownRenderer, Modal, Notice } from 'obsidian'
import type { LifeTrackerPlugin } from '../../plugin'
import type { AIAnalysisResult } from '../../types'
import { AI_PROVIDER_LABELS } from '../../types'

/**
 * Modal to display AI analysis results.
 * Renders markdown content with a header showing provider info.
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

        // Content area with markdown rendering
        const contentArea = contentEl.createDiv({ cls: 'lt-ai-analysis-content' })
        void MarkdownRenderer.render(
            this.plugin.app,
            this.result.content,
            contentArea,
            '',
            this.plugin
        )

        // Action buttons
        const actionsEl = contentEl.createDiv({ cls: 'lt-ai-analysis-actions' })

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
