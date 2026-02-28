import { MarkdownRenderer, Modal, Notice, type TFile, normalizePath } from 'obsidian'
import type { LifeTrackerPlugin } from '../../plugin'
import type { AIAnalysisResult } from '../../types'
import { AI_PROVIDER_LABELS } from '../../types'
import { formatDateISO } from '../../../utils/date.utils'
import { log } from '../../../utils'
import { collectNotesForDateRange, buildSummaryMessage } from '../../commands/summary-utils'
import {
    startOfDay,
    endOfDay,
    subDays,
    startOfWeek as dateFnsStartOfWeek,
    endOfWeek as dateFnsEndOfWeek,
    subWeeks,
    startOfMonth as dateFnsStartOfMonth,
    endOfMonth as dateFnsEndOfMonth,
    subMonths,
    parseISO
} from 'date-fns'
import { startOfWeek } from '../../../utils/date.utils'

/* ── Prompts ─────────────────────────────────────────────── */

const DEFAULT_DAILY_SUMMARY_PROMPT = `You are a personal life tracking analyst. The user is reviewing their daily data. Analyze the data provided and create a concise daily summary.

Guidelines:
- Start with a brief overall assessment of the day
- Highlight key accomplishments and completed tasks
- Note any undone or pending tasks and their priorities
- Identify patterns compared to typical days if data allows
- Point out any notable metrics (unusually high or low values)
- Provide 1-2 actionable suggestions for tomorrow
- Be supportive and constructive
- Format your response in markdown with clear sections`

const DEFAULT_WEEKLY_SUMMARY_PROMPT = `You are a personal life tracking analyst. The user is reviewing their weekly data. Analyze the data provided and create a comprehensive but concise weekly summary.

Guidelines:
- Start with a brief overall assessment of the week
- Highlight trends (improving, declining, or stable metrics)
- Calculate and mention averages for key metrics
- Identify the best and worst days, and what might have caused them
- Note any correlations between different metrics
- Provide 2-3 actionable suggestions for the coming week
- Be supportive and constructive
- Format your response in markdown with clear sections`

const DEFAULT_MONTHLY_SUMMARY_PROMPT = `You are a personal life tracking analyst. The user is reviewing their monthly data. Analyze the data provided and create a comprehensive but concise monthly summary.

Guidelines:
- Start with a brief overall assessment of the month
- Highlight trends across the month (improving, declining, or stable metrics)
- Calculate and mention averages for key metrics
- Identify the best and worst weeks/days, and what might have caused them
- Note any correlations between different metrics
- Compare the first half vs second half of the month for progression
- Provide 3-5 actionable suggestions for the coming month
- Be supportive and constructive
- Format your response in markdown with clear sections`

/* ── Types ────────────────────────────────────────────────── */

type SummaryPeriod = 'day' | 'week' | 'month' | 'custom'

interface PeriodOption {
    value: SummaryPeriod
    label: string
}

const PERIOD_OPTIONS: PeriodOption[] = [
    { value: 'day', label: 'Day' },
    { value: 'week', label: 'Week' },
    { value: 'month', label: 'Month' },
    { value: 'custom', label: 'Custom' }
]

type DayPreset = 'today' | 'yesterday'
type WeekPreset = 'this_week' | 'last_week'
type MonthPreset = 'this_month' | 'last_month'

const DAY_PRESETS: Array<{ value: DayPreset; label: string }> = [
    { value: 'today', label: 'Today' },
    { value: 'yesterday', label: 'Yesterday' }
]

const WEEK_PRESETS: Array<{ value: WeekPreset; label: string }> = [
    { value: 'this_week', label: 'This week' },
    { value: 'last_week', label: 'Last week' }
]

const MONTH_PRESETS: Array<{ value: MonthPreset; label: string }> = [
    { value: 'this_month', label: 'This month' },
    { value: 'last_month', label: 'Last month' }
]

/* ── Modal ────────────────────────────────────────────────── */

/**
 * Unified summary modal that combines daily/weekly/monthly summary generation
 * with custom date range support. Shows a form to pick period and dates,
 * generates the AI summary, then displays the result — all in one modal.
 */
export class SummaryModal extends Modal {
    private plugin: LifeTrackerPlugin
    /** The file that was active when the modal was created */
    private activeFile: TFile | null

    /* ── Form state ──────────────────────────────────────── */
    private selectedPeriod: SummaryPeriod = 'day'
    private dayPreset: DayPreset = 'today'
    private weekPreset: WeekPreset = 'this_week'
    private monthPreset: MonthPreset = 'this_month'
    private customStartDate = ''
    private customEndDate = ''

    /* ── UI refs ─────────────────────────────────────────── */
    private presetContainer!: HTMLDivElement
    private generateBtn!: HTMLButtonElement
    private formEl!: HTMLDivElement
    private resultEl!: HTMLDivElement

    /* ── Result state ────────────────────────────────────── */
    private result: AIAnalysisResult | null = null
    private resultTitle = ''

    constructor(plugin: LifeTrackerPlugin) {
        super(plugin.app)
        this.plugin = plugin
        this.activeFile = plugin.app.workspace.getActiveFile()

        // Load defaults from settings
        this.dayPreset = plugin.settings.ai.dailySummary.defaultDateRange
        this.weekPreset = plugin.settings.ai.weeklySummary.defaultDateRange
        this.monthPreset = plugin.settings.ai.monthlySummary.defaultDateRange

        // Set default custom dates to today
        const today = formatDateISO(new Date())
        this.customStartDate = today
        this.customEndDate = today
    }

    override onOpen(): void {
        const { contentEl } = this
        contentEl.empty()
        contentEl.addClass('lt-ai-analysis-modal')

        this.formEl = contentEl.createDiv({ cls: 'lt-summary-form' })
        this.resultEl = contentEl.createDiv({ cls: 'lt-summary-result hidden' })

        this.renderForm()
    }

    override onClose(): void {
        this.contentEl.empty()
    }

    /* ═══════════════════════════════════════════════════════
     * Form rendering
     * ═══════════════════════════════════════════════════════ */

    private renderForm(): void {
        const el = this.formEl
        el.empty()

        // Title
        el.createDiv({
            cls: 'lt-ai-analysis-title',
            text: 'Generate summary'
        })

        // Period selector
        const periodSection = el.createDiv({ cls: 'lt-summary-field' })
        periodSection.createDiv({ cls: 'lt-summary-label', text: 'Period' })

        const periodSelect = periodSection.createEl('select', {
            cls: 'dropdown lt-summary-select'
        })
        for (const opt of PERIOD_OPTIONS) {
            const optEl = periodSelect.createEl('option', {
                value: opt.value,
                text: opt.label
            })
            if (opt.value === this.selectedPeriod) {
                optEl.selected = true
            }
        }
        periodSelect.addEventListener('change', () => {
            this.selectedPeriod = periodSelect.value as SummaryPeriod
            this.renderPresetSection()
            this.updateGenerateButton()
        })

        // Preset / custom date section
        this.presetContainer = el.createDiv({ cls: 'lt-summary-field' })
        this.renderPresetSection()

        // Generate button
        const actionsEl = el.createDiv({ cls: 'lt-summary-form-actions' })
        this.generateBtn = actionsEl.createEl('button', {
            cls: 'lt-ai-analysis-btn lt-ai-analysis-btn--primary',
            text: 'Generate'
        })
        this.generateBtn.addEventListener('click', () => {
            void this.onGenerate()
        })
        this.updateGenerateButton()
    }

    private renderPresetSection(): void {
        const el = this.presetContainer
        el.empty()

        switch (this.selectedPeriod) {
            case 'day': {
                el.createDiv({ cls: 'lt-summary-label', text: 'Date range' })
                const select = el.createEl('select', { cls: 'dropdown lt-summary-select' })
                for (const preset of DAY_PRESETS) {
                    const optEl = select.createEl('option', {
                        value: preset.value,
                        text: preset.label
                    })
                    if (preset.value === this.dayPreset) optEl.selected = true
                }
                select.addEventListener('change', () => {
                    this.dayPreset = select.value as DayPreset
                })
                break
            }
            case 'week': {
                el.createDiv({ cls: 'lt-summary-label', text: 'Date range' })
                const select = el.createEl('select', { cls: 'dropdown lt-summary-select' })
                for (const preset of WEEK_PRESETS) {
                    const optEl = select.createEl('option', {
                        value: preset.value,
                        text: preset.label
                    })
                    if (preset.value === this.weekPreset) optEl.selected = true
                }
                select.addEventListener('change', () => {
                    this.weekPreset = select.value as WeekPreset
                })
                break
            }
            case 'month': {
                el.createDiv({ cls: 'lt-summary-label', text: 'Date range' })
                const select = el.createEl('select', { cls: 'dropdown lt-summary-select' })
                for (const preset of MONTH_PRESETS) {
                    const optEl = select.createEl('option', {
                        value: preset.value,
                        text: preset.label
                    })
                    if (preset.value === this.monthPreset) optEl.selected = true
                }
                select.addEventListener('change', () => {
                    this.monthPreset = select.value as MonthPreset
                })
                break
            }
            case 'custom': {
                el.createDiv({ cls: 'lt-summary-label', text: 'Start date' })
                const startInput = el.createEl('input', {
                    cls: 'lt-summary-date-input',
                    type: 'date',
                    value: this.customStartDate
                })
                startInput.addEventListener('change', () => {
                    this.customStartDate = startInput.value
                    this.updateGenerateButton()
                })

                el.createDiv({ cls: 'lt-summary-label lt-summary-label--end', text: 'End date' })
                const endInput = el.createEl('input', {
                    cls: 'lt-summary-date-input',
                    type: 'date',
                    value: this.customEndDate
                })
                endInput.addEventListener('change', () => {
                    this.customEndDate = endInput.value
                    this.updateGenerateButton()
                })
                break
            }
        }
    }

    private updateGenerateButton(): void {
        if (!this.generateBtn) return

        if (this.selectedPeriod === 'custom') {
            const valid = this.customStartDate !== '' && this.customEndDate !== ''
            this.generateBtn.disabled = !valid
        } else {
            this.generateBtn.disabled = false
        }
    }

    /* ═══════════════════════════════════════════════════════
     * Generation logic
     * ═══════════════════════════════════════════════════════ */

    private async onGenerate(): Promise<void> {
        log('[SummaryModal] Starting summary generation', 'debug')

        // Validate AI config
        if (!this.plugin.settings.ai.enabled) {
            new Notice(
                'AI integration is not enabled. Configure it in Settings → Life Tracker → Integrations.'
            )
            return
        }
        if (!this.plugin.settings.ai.provider.apiKey) {
            new Notice(
                'AI API key is not configured. Set it in Settings → Life Tracker → Integrations.'
            )
            return
        }

        // Calculate date range
        const dateRange = this.getDateRange()
        const startStr = formatDateISO(dateRange.start)
        const endStr = formatDateISO(dateRange.end)

        log(
            `[SummaryModal] Period: ${this.selectedPeriod}, range: ${startStr} to ${endStr}`,
            'debug'
        )

        // Determine filter tag & period type for data collection
        const { filterTag, periodType, includeCsv, periodLabel, systemPrompt } =
            this.getSummaryConfig()

        // Show loading state
        this.generateBtn.disabled = true
        this.generateBtn.textContent = 'Generating...'

        new Notice(
            `Collecting data for ${startStr}${startStr !== endStr ? ` to ${endStr}` : ''}...`
        )

        // Collect data
        const noteDataList = collectNotesForDateRange(this.plugin, dateRange, filterTag, periodType)

        if (noteDataList.length === 0) {
            new Notice(
                `No data found for ${startStr}${startStr !== endStr ? ` to ${endStr}` : ''}. Check your tag filter and date range.`
            )
            this.generateBtn.disabled = false
            this.generateBtn.textContent = 'Generate'
            return
        }

        // Build AI message
        const userMessage = buildSummaryMessage(noteDataList, dateRange, includeCsv, periodLabel)

        log(`[SummaryModal] Built AI message (${userMessage.length} chars)`, 'debug')

        new Notice(`Analyzing ${noteDataList.length} notes with AI...`)

        // Call AI
        const result = await this.plugin.aiService.analyze(systemPrompt, userMessage)

        log(
            `[SummaryModal] AI result: success=${String(result.success)}, content length=${result.content.length}`,
            'debug'
        )

        // Build title
        this.resultTitle =
            startStr === endStr
                ? `${periodLabel} summary: ${startStr}`
                : `${periodLabel} summary: ${startStr} to ${endStr}`

        this.result = result

        // Auto-save to note if enabled
        if (this.plugin.settings.ai.autoSaveToNote && result.success) {
            await this.saveToNote()
            log('[SummaryModal] Auto-saved report to note', 'debug')
        }

        // Show result view
        this.showResult()
    }

    private getDateRange(): { start: Date; end: Date } {
        const now = new Date()

        switch (this.selectedPeriod) {
            case 'day': {
                if (this.dayPreset === 'yesterday') {
                    const yesterday = subDays(now, 1)
                    return { start: startOfDay(yesterday), end: endOfDay(yesterday) }
                }
                return { start: startOfDay(now), end: endOfDay(now) }
            }
            case 'week': {
                if (this.weekPreset === 'last_week') {
                    const lastWeekDate = subWeeks(now, 1)
                    return {
                        start: dateFnsStartOfWeek(lastWeekDate, { weekStartsOn: 1 }),
                        end: dateFnsEndOfWeek(lastWeekDate, { weekStartsOn: 1 })
                    }
                }
                return {
                    start: startOfWeek(now),
                    end: dateFnsEndOfWeek(now, { weekStartsOn: 1 })
                }
            }
            case 'month': {
                if (this.monthPreset === 'last_month') {
                    const lastMonthDate = subMonths(now, 1)
                    return {
                        start: dateFnsStartOfMonth(lastMonthDate),
                        end: dateFnsEndOfMonth(lastMonthDate)
                    }
                }
                return {
                    start: dateFnsStartOfMonth(now),
                    end: dateFnsEndOfMonth(now)
                }
            }
            case 'custom': {
                const start = parseISO(this.customStartDate)
                const end = parseISO(this.customEndDate)
                return { start: startOfDay(start), end: endOfDay(end) }
            }
        }
    }

    private getSummaryConfig(): {
        filterTag: string
        periodType: 'daily' | 'weekly' | 'monthly'
        includeCsv: boolean
        periodLabel: string
        systemPrompt: string
    } {
        const ai = this.plugin.settings.ai

        switch (this.selectedPeriod) {
            case 'day':
                return {
                    filterTag: ai.dailySummary.filterTag,
                    periodType: 'daily',
                    includeCsv: ai.dailySummary.includeCsvData,
                    periodLabel: 'Daily',
                    systemPrompt: ai.dailySummaryPrompt.trim() || DEFAULT_DAILY_SUMMARY_PROMPT
                }
            case 'week':
                return {
                    filterTag: ai.weeklySummary.filterTag,
                    periodType: 'weekly',
                    includeCsv: ai.weeklySummary.includeCsvData,
                    periodLabel: 'Weekly',
                    systemPrompt: ai.weeklySummaryPrompt.trim() || DEFAULT_WEEKLY_SUMMARY_PROMPT
                }
            case 'month':
                return {
                    filterTag: ai.monthlySummary.filterTag,
                    periodType: 'monthly',
                    includeCsv: ai.monthlySummary.includeCsvData,
                    periodLabel: 'Monthly',
                    systemPrompt: ai.monthlySummaryPrompt.trim() || DEFAULT_MONTHLY_SUMMARY_PROMPT
                }
            case 'custom':
                // Custom uses monthly settings as fallback
                return {
                    filterTag: ai.monthlySummary.filterTag,
                    periodType: 'monthly',
                    includeCsv: ai.monthlySummary.includeCsvData,
                    periodLabel: 'Custom',
                    systemPrompt: ai.monthlySummaryPrompt.trim() || DEFAULT_MONTHLY_SUMMARY_PROMPT
                }
        }
    }

    /* ═══════════════════════════════════════════════════════
     * Result rendering
     * ═══════════════════════════════════════════════════════ */

    private showResult(): void {
        this.formEl.addClass('hidden')
        this.resultEl.removeClass('hidden')
        this.renderResult()
    }

    private showForm(): void {
        this.resultEl.addClass('hidden')
        this.resultEl.empty()
        this.formEl.removeClass('hidden')

        // Reset generate button
        this.generateBtn.disabled = false
        this.generateBtn.textContent = 'Generate'
    }

    private renderResult(): void {
        const el = this.resultEl
        el.empty()

        if (!this.result) return

        // Title
        el.createDiv({
            cls: 'lt-ai-analysis-title',
            text: this.resultTitle
        })

        if (!this.result.success) {
            this.renderError(el)
            return
        }

        // Provider info badge
        const providerLabel = AI_PROVIDER_LABELS[this.result.provider]
        const infoBadge = el.createDiv({ cls: 'lt-ai-analysis-info' })
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
        const scrollWrapper = el.createDiv({ cls: 'lt-ai-analysis-scroll-wrapper' })
        const contentArea = scrollWrapper.createDiv({ cls: 'lt-ai-analysis-content' })
        void MarkdownRenderer.render(
            this.plugin.app,
            this.result.content,
            contentArea,
            '',
            this.plugin
        )

        // Action buttons
        const actionsEl = el.createDiv({ cls: 'lt-ai-analysis-actions' })

        // Back button (left side)
        const backBtn = actionsEl.createEl('button', {
            cls: 'lt-ai-analysis-btn',
            text: 'Back'
        })
        backBtn.addEventListener('click', () => {
            this.showForm()
        })

        // Spacer to push action buttons right
        actionsEl.createDiv({ cls: 'lt-summary-actions-spacer' })

        // Save note to current button
        const saveBtn = actionsEl.createEl('button', {
            cls: 'lt-ai-analysis-btn',
            text: 'Save note to current'
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
            if (this.result) {
                void navigator.clipboard.writeText(this.result.content).then(() => {
                    new Notice('Analysis copied to clipboard')
                })
            }
        })

        // Close button
        const closeBtn = actionsEl.createEl('button', {
            cls: 'lt-ai-analysis-btn lt-ai-analysis-btn--primary',
            text: 'Close'
        })
        closeBtn.addEventListener('click', () => this.close())
    }

    private renderError(el: HTMLDivElement): void {
        const errorEl = el.createDiv({ cls: 'lt-ai-analysis-error' })
        errorEl.createDiv({
            cls: 'lt-ai-analysis-error-title',
            text: 'Analysis failed'
        })
        errorEl.createDiv({
            cls: 'lt-ai-analysis-error-message',
            text: this.result?.error ?? 'Unknown error'
        })

        const actionsEl = el.createDiv({ cls: 'lt-ai-analysis-actions' })

        const backBtn = actionsEl.createEl('button', {
            cls: 'lt-ai-analysis-btn',
            text: 'Back'
        })
        backBtn.addEventListener('click', () => {
            this.showForm()
        })

        actionsEl.createDiv({ cls: 'lt-summary-actions-spacer' })

        const closeBtn = actionsEl.createEl('button', {
            cls: 'lt-ai-analysis-btn lt-ai-analysis-btn--primary',
            text: 'Close'
        })
        closeBtn.addEventListener('click', () => this.close())
    }

    /* ═══════════════════════════════════════════════════════
     * Save functionality
     * ═══════════════════════════════════════════════════════ */

    private async saveToNote(): Promise<void> {
        if (!this.result || !this.result.success) return

        const dateStr = formatDateISO(new Date())
        const providerInfo = `${AI_PROVIDER_LABELS[this.result.provider]} / ${this.result.model}`

        const appendContent = [
            '',
            `## ${this.resultTitle}`,
            '',
            `> Generated on ${dateStr} by Life Tracker using ${providerInfo}`,
            '',
            this.result.content
        ].join('\n')

        // Append to active file
        await this.appendToActiveFile(appendContent)

        // Optionally also save to a dedicated folder
        if (this.plugin.settings.ai.saveToFolder) {
            await this.saveToFolder(dateStr, providerInfo)
        }
    }

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

    private async saveToFolder(dateStr: string, providerInfo: string): Promise<void> {
        if (!this.result) return

        const folderPath = this.plugin.settings.ai.reportFolderPath || 'Life Tracker Reports'
        const sanitizedTitle = this.resultTitle
            .replace(/[:/\\?*"<>|]/g, '-')
            .replace(/\s+/g, ' ')
            .trim()
        const fileName = `${dateStr} - ${sanitizedTitle}.md`
        const filePath = normalizePath(`${folderPath}/${fileName}`)

        const noteContent = [
            `# ${this.resultTitle}`,
            '',
            `> Generated on ${dateStr} by Life Tracker using ${providerInfo}`,
            '',
            this.result.content
        ].join('\n')

        try {
            const folder = this.plugin.app.vault.getAbstractFileByPath(folderPath)
            if (!folder) {
                await this.plugin.app.vault.createFolder(folderPath)
            }

            const existing = this.plugin.app.vault.getAbstractFileByPath(filePath)
            if (existing) {
                await this.plugin.app.vault.modify(existing as TFile, noteContent)
                log(`[SummaryModal] Report updated in folder: ${fileName}`, 'debug')
            } else {
                await this.plugin.app.vault.create(filePath, noteContent)
                log(`[SummaryModal] Report saved to folder: ${fileName}`, 'debug')
            }
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error'
            new Notice(`Failed to save report to folder: ${message}`)
        }
    }
}
