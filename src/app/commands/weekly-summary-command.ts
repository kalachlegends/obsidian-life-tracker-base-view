import { Notice } from 'obsidian'
import type { LifeTrackerPlugin } from '../plugin'
import { formatDateISO } from '../../utils/date.utils'
import {
    endOfWeek as dateFnsEndOfWeek,
    startOfWeek as dateFnsStartOfWeek,
    subWeeks
} from 'date-fns'
import { startOfWeek } from '../../utils/date.utils'
import { AIAnalysisModal } from '../components/modals/ai-analysis-modal'
import { log } from '../../utils'
import { collectNotesForDateRange, buildSummaryMessage } from './summary-utils'

/** Default system prompt for weekly summary */
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

/**
 * Register the weekly summary command
 */
export function registerWeeklySummaryCommand(plugin: LifeTrackerPlugin): void {
    plugin.addCommand({
        id: 'weekly-summary',
        name: 'Generate weekly summary with AI',
        callback: () => {
            void executeWeeklySummary(plugin)
        }
    })
}

/**
 * Execute the weekly summary flow
 */
async function executeWeeklySummary(plugin: LifeTrackerPlugin): Promise<void> {
    log('[WeeklySummary] Starting weekly summary generation', 'debug')

    // Check AI is configured
    if (!plugin.settings.ai.enabled) {
        log('[WeeklySummary] AI integration is not enabled', 'warn')
        new Notice(
            'AI integration is not enabled. Configure it in Settings → Life Tracker → Integrations.'
        )
        return
    }

    if (!plugin.settings.ai.provider.apiKey) {
        log('[WeeklySummary] AI API key is not configured', 'warn')
        new Notice(
            'AI API key is not configured. Set it in Settings → Life Tracker → Integrations.'
        )
        return
    }

    log(
        `[WeeklySummary] AI provider: ${plugin.settings.ai.provider.type}, model: ${plugin.settings.ai.provider.model}`,
        'debug'
    )

    // Determine date range
    const dateRange = getWeeklySummaryDateRange(plugin)
    const startStr = formatDateISO(dateRange.start)
    const endStr = formatDateISO(dateRange.end)

    log(
        `[WeeklySummary] Date range: ${startStr} to ${endStr} (setting: ${plugin.settings.ai.weeklySummary.defaultDateRange})`,
        'debug'
    )

    new Notice(`Collecting data for ${startStr} to ${endStr}...`)

    // Collect data using shared utility
    const noteDataList = collectNotesForDateRange(
        plugin,
        dateRange,
        plugin.settings.ai.weeklySummary.filterTag,
        'weekly'
    )

    if (noteDataList.length === 0) {
        log(
            `[WeeklySummary] No data found for ${startStr} to ${endStr}. All files filtered out.`,
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
        plugin.settings.ai.weeklySummary.includeCsvData,
        'Weekly'
    )

    log(`[WeeklySummary] Built AI message (${userMessage.length} chars)`, 'debug')
    log(`[WeeklySummary] AI message preview:\n${userMessage.substring(0, 500)}...`, 'debug')

    // Use custom prompt or default
    const systemPrompt =
        plugin.settings.ai.weeklySummaryPrompt.trim() || DEFAULT_WEEKLY_SUMMARY_PROMPT

    new Notice(`Analyzing ${noteDataList.length} notes with AI...`)

    log(
        `[WeeklySummary] Sending to AI: ${plugin.settings.ai.provider.type}/${plugin.settings.ai.provider.model}`,
        'debug'
    )

    // Send to AI
    const result = await plugin.aiService.analyze(systemPrompt, userMessage)

    log(
        `[WeeklySummary] AI result: success=${String(result.success)}, content length=${result.content.length}, error=${result.error ?? 'none'}`,
        'debug'
    )

    if (result.usage) {
        log(
            `[WeeklySummary] Token usage: prompt=${result.usage.promptTokens}, completion=${result.usage.completionTokens}, total=${result.usage.totalTokens}`,
            'debug'
        )
    }

    // Show result
    new AIAnalysisModal(plugin, result, `Weekly summary: ${startStr} to ${endStr}`).open()
}

/**
 * Get the date range for the weekly summary based on settings
 */
function getWeeklySummaryDateRange(plugin: LifeTrackerPlugin): { start: Date; end: Date } {
    const now = new Date()

    log(`[WeeklySummary] Current date/time: ${now.toISOString()}`, 'debug')
    log(
        `[WeeklySummary] Date range setting: ${plugin.settings.ai.weeklySummary.defaultDateRange}`,
        'debug'
    )

    if (plugin.settings.ai.weeklySummary.defaultDateRange === 'last_week') {
        const lastWeekDate = subWeeks(now, 1)
        const range = {
            start: dateFnsStartOfWeek(lastWeekDate, { weekStartsOn: 1 }),
            end: dateFnsEndOfWeek(lastWeekDate, { weekStartsOn: 1 })
        }
        log(
            `[WeeklySummary] Last week range: ${range.start.toISOString()} to ${range.end.toISOString()}`,
            'debug'
        )
        return range
    }

    // Default: this_week
    const range = {
        start: startOfWeek(now),
        end: dateFnsEndOfWeek(now, { weekStartsOn: 1 })
    }
    log(
        `[WeeklySummary] This week range: ${range.start.toISOString()} to ${range.end.toISOString()}`,
        'debug'
    )
    return range
}
