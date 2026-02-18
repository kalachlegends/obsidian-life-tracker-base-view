import { Notice } from 'obsidian'
import type { LifeTrackerPlugin } from '../plugin'
import { formatDateISO } from '../../utils/date.utils'
import {
    startOfMonth as dateFnsStartOfMonth,
    endOfMonth as dateFnsEndOfMonth,
    subMonths
} from 'date-fns'
import { AIAnalysisModal } from '../components/modals/ai-analysis-modal'
import { log } from '../../utils'
import { collectNotesForDateRange, buildSummaryMessage } from './summary-utils'

/** Default system prompt for monthly summary */
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

/**
 * Register the monthly summary command
 */
export function registerMonthlySummaryCommand(plugin: LifeTrackerPlugin): void {
    plugin.addCommand({
        id: 'monthly-summary',
        name: 'Generate monthly summary with AI',
        callback: () => {
            void executeMonthlySummary(plugin)
        }
    })
}

/**
 * Execute the monthly summary flow
 */
async function executeMonthlySummary(plugin: LifeTrackerPlugin): Promise<void> {
    log('[MonthlySummary] Starting monthly summary generation', 'debug')

    // Check AI is configured
    if (!plugin.settings.ai.enabled) {
        log('[MonthlySummary] AI integration is not enabled', 'warn')
        new Notice(
            'AI integration is not enabled. Configure it in Settings → Life Tracker → Integrations.'
        )
        return
    }

    if (!plugin.settings.ai.provider.apiKey) {
        log('[MonthlySummary] AI API key is not configured', 'warn')
        new Notice(
            'AI API key is not configured. Set it in Settings → Life Tracker → Integrations.'
        )
        return
    }

    log(
        `[MonthlySummary] AI provider: ${plugin.settings.ai.provider.type}, model: ${plugin.settings.ai.provider.model}`,
        'debug'
    )

    // Determine date range
    const dateRange = getMonthlySummaryDateRange(plugin)
    const startStr = formatDateISO(dateRange.start)
    const endStr = formatDateISO(dateRange.end)

    log(
        `[MonthlySummary] Date range: ${startStr} to ${endStr} (setting: ${plugin.settings.ai.monthlySummary.defaultDateRange})`,
        'debug'
    )

    new Notice(`Collecting data for ${startStr} to ${endStr}...`)

    // Collect data using shared utility
    const noteDataList = collectNotesForDateRange(
        plugin,
        dateRange,
        plugin.settings.ai.monthlySummary.filterTag,
        'monthly'
    )

    if (noteDataList.length === 0) {
        log(
            `[MonthlySummary] No data found for ${startStr} to ${endStr}. All files filtered out.`,
            'warn'
        )
        new Notice(
            `No data found for ${startStr} to ${endStr}. Check your tag filter and date range.`
        )
        return
    }

    // Build the message for AI using shared utility
    const userMessage = buildSummaryMessage(
        noteDataList,
        dateRange,
        plugin.settings.ai.monthlySummary.includeCsvData,
        'Monthly'
    )

    log(`[MonthlySummary] Built AI message (${userMessage.length} chars)`, 'debug')
    log(`[MonthlySummary] AI message preview:\n${userMessage.substring(0, 500)}...`, 'debug')

    // Use custom prompt or default
    const systemPrompt =
        plugin.settings.ai.monthlySummaryPrompt.trim() || DEFAULT_MONTHLY_SUMMARY_PROMPT

    new Notice(`Analyzing ${noteDataList.length} notes with AI...`)

    log(
        `[MonthlySummary] Sending to AI: ${plugin.settings.ai.provider.type}/${plugin.settings.ai.provider.model}`,
        'debug'
    )

    // Send to AI
    const result = await plugin.aiService.analyze(systemPrompt, userMessage)

    log(
        `[MonthlySummary] AI result: success=${String(result.success)}, content length=${result.content.length}, error=${result.error ?? 'none'}`,
        'debug'
    )

    if (result.usage) {
        log(
            `[MonthlySummary] Token usage: prompt=${result.usage.promptTokens}, completion=${result.usage.completionTokens}, total=${result.usage.totalTokens}`,
            'debug'
        )
    }

    // Show result
    new AIAnalysisModal(plugin, result, `Monthly summary: ${startStr} to ${endStr}`).open()
}

/**
 * Get the date range for the monthly summary based on settings
 */
function getMonthlySummaryDateRange(plugin: LifeTrackerPlugin): { start: Date; end: Date } {
    const now = new Date()

    log(`[MonthlySummary] Current date/time: ${now.toISOString()}`, 'debug')
    log(
        `[MonthlySummary] Date range setting: ${plugin.settings.ai.monthlySummary.defaultDateRange}`,
        'debug'
    )

    if (plugin.settings.ai.monthlySummary.defaultDateRange === 'last_month') {
        const lastMonthDate = subMonths(now, 1)
        const range = {
            start: dateFnsStartOfMonth(lastMonthDate),
            end: dateFnsEndOfMonth(lastMonthDate)
        }
        log(
            `[MonthlySummary] Last month range: ${range.start.toISOString()} to ${range.end.toISOString()}`,
            'debug'
        )
        return range
    }

    // Default: this_month
    const range = {
        start: dateFnsStartOfMonth(now),
        end: dateFnsEndOfMonth(now)
    }
    log(
        `[MonthlySummary] This month range: ${range.start.toISOString()} to ${range.end.toISOString()}`,
        'debug'
    )
    return range
}
