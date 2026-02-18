import { Notice } from 'obsidian'
import type { LifeTrackerPlugin } from '../plugin'
import { formatDateISO } from '../../utils/date.utils'
import { startOfDay, endOfDay, subDays } from 'date-fns'
import { AIAnalysisModal } from '../components/modals/ai-analysis-modal'
import { log } from '../../utils'
import { collectNotesForDateRange, buildSummaryMessage } from './summary-utils'

/** Default system prompt for daily summary */
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

/**
 * Register the daily summary command
 */
export function registerDailySummaryCommand(plugin: LifeTrackerPlugin): void {
    plugin.addCommand({
        id: 'daily-summary',
        name: 'Generate daily summary with AI',
        callback: () => {
            void executeDailySummary(plugin)
        }
    })
}

/**
 * Execute the daily summary flow
 */
async function executeDailySummary(plugin: LifeTrackerPlugin): Promise<void> {
    log('[DailySummary] Starting daily summary generation', 'debug')

    // Check AI is configured
    if (!plugin.settings.ai.enabled) {
        log('[DailySummary] AI integration is not enabled', 'warn')
        new Notice(
            'AI integration is not enabled. Configure it in Settings → Life Tracker → Integrations.'
        )
        return
    }

    if (!plugin.settings.ai.provider.apiKey) {
        log('[DailySummary] AI API key is not configured', 'warn')
        new Notice(
            'AI API key is not configured. Set it in Settings → Life Tracker → Integrations.'
        )
        return
    }

    log(
        `[DailySummary] AI provider: ${plugin.settings.ai.provider.type}, model: ${plugin.settings.ai.provider.model}`,
        'debug'
    )

    // Determine date range
    const dateRange = getDailySummaryDateRange(plugin)
    const startStr = formatDateISO(dateRange.start)
    const endStr = formatDateISO(dateRange.end)

    log(
        `[DailySummary] Date range: ${startStr} to ${endStr} (setting: ${plugin.settings.ai.dailySummary.defaultDateRange})`,
        'debug'
    )

    new Notice(`Collecting data for ${startStr}...`)

    // Collect data using shared utility
    const noteDataList = collectNotesForDateRange(
        plugin,
        dateRange,
        plugin.settings.ai.dailySummary.filterTag,
        'daily'
    )

    if (noteDataList.length === 0) {
        log(`[DailySummary] No data found for ${startStr}. All files filtered out.`, 'warn')
        new Notice(`No data found for ${startStr}. Check your tag filter and date range.`)
        return
    }

    // Build the message for AI using shared utility
    const userMessage = buildSummaryMessage(
        noteDataList,
        dateRange,
        plugin.settings.ai.dailySummary.includeCsvData,
        'Daily'
    )

    log(`[DailySummary] Built AI message (${userMessage.length} chars)`, 'debug')
    log(`[DailySummary] AI message preview:\n${userMessage.substring(0, 500)}...`, 'debug')

    // Use custom prompt or default
    const systemPrompt =
        plugin.settings.ai.dailySummaryPrompt.trim() || DEFAULT_DAILY_SUMMARY_PROMPT

    new Notice(`Analyzing ${noteDataList.length} notes with AI...`)

    log(
        `[DailySummary] Sending to AI: ${plugin.settings.ai.provider.type}/${plugin.settings.ai.provider.model}`,
        'debug'
    )

    // Send to AI
    const result = await plugin.aiService.analyze(systemPrompt, userMessage)

    log(
        `[DailySummary] AI result: success=${String(result.success)}, content length=${result.content.length}, error=${result.error ?? 'none'}`,
        'debug'
    )

    if (result.usage) {
        log(
            `[DailySummary] Token usage: prompt=${result.usage.promptTokens}, completion=${result.usage.completionTokens}, total=${result.usage.totalTokens}`,
            'debug'
        )
    }

    // Show result
    new AIAnalysisModal(plugin, result, `Daily summary: ${startStr}`).open()
}

/**
 * Get the date range for the daily summary based on settings
 */
function getDailySummaryDateRange(plugin: LifeTrackerPlugin): { start: Date; end: Date } {
    const now = new Date()

    log(`[DailySummary] Current date/time: ${now.toISOString()}`, 'debug')
    log(
        `[DailySummary] Date range setting: ${plugin.settings.ai.dailySummary.defaultDateRange}`,
        'debug'
    )

    if (plugin.settings.ai.dailySummary.defaultDateRange === 'yesterday') {
        const yesterday = subDays(now, 1)
        const range = {
            start: startOfDay(yesterday),
            end: endOfDay(yesterday)
        }
        log(
            `[DailySummary] Yesterday range: ${range.start.toISOString()} to ${range.end.toISOString()}`,
            'debug'
        )
        return range
    }

    // Default: today
    const range = {
        start: startOfDay(now),
        end: endOfDay(now)
    }
    log(
        `[DailySummary] Today range: ${range.start.toISOString()} to ${range.end.toISOString()}`,
        'debug'
    )
    return range
}
