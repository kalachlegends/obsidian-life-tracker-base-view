import { Notice, type TFile } from 'obsidian'
import type { LifeTrackerPlugin } from '../plugin'
import type { PropertyDefinition } from '../types'
import { FrontmatterService } from '../services/frontmatter.service'
import { PropertyRecognitionService } from '../services/property-recognition.service'
import { parseDateFromFilename, startOfWeek, formatDateISO } from '../../utils/date.utils'
import {
    endOfWeek as dateFnsEndOfWeek,
    startOfWeek as dateFnsStartOfWeek,
    subWeeks,
    isWithinInterval
} from 'date-fns'
import { AIAnalysisModal } from '../components/modals/ai-analysis-modal'
import { log } from '../../utils'

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
 * Data collected for a single note in the weekly summary
 */
interface NoteData {
    filename: string
    date: Date
    values: Record<string, unknown>
}

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

    // Collect data
    const frontmatterService = new FrontmatterService(plugin.app)
    const recognitionService = new PropertyRecognitionService(plugin.app)
    const allDefinitions = plugin.settings.propertyDefinitions

    log(
        `[WeeklySummary] Total property definitions: ${allDefinitions.length}`,
        'debug',
        allDefinitions.map((d) => `${d.name} (${d.type})`)
    )

    // Get the property names to include
    const includeProperties = plugin.settings.ai.weeklySummary.includeProperties
    const filterTag = plugin.settings.ai.weeklySummary.filterTag.trim()

    log(
        `[WeeklySummary] Filter tag: "${filterTag || '(none)'}", include properties: ${includeProperties.length > 0 ? JSON.stringify(includeProperties) : '(auto: number/checkbox/text)'}`,
        'debug'
    )

    // Get all markdown files
    const allFiles = plugin.app.vault.getMarkdownFiles()

    log(`[WeeklySummary] Total markdown files in vault: ${allFiles.length}`, 'debug')

    // Filter and collect data
    const noteDataList: NoteData[] = []

    // Debug counters
    let skippedByTag = 0
    let skippedByDateParse = 0
    let skippedByDateRange = 0
    let skippedByNoProperties = 0
    let skippedByNoValues = 0

    for (const file of allFiles) {
        // Filter by tag if configured
        if (filterTag && !fileHasTag(plugin, file, filterTag)) {
            skippedByTag++
            continue
        }

        // Parse date from filename
        const parsed = parseDateFromFilename(file.basename)
        if (!parsed) {
            skippedByDateParse++
            continue
        }

        // Filter by date range
        if (!isWithinInterval(parsed.date, { start: dateRange.start, end: dateRange.end })) {
            skippedByDateRange++
            continue
        }

        log(
            `[WeeklySummary] Processing file: ${file.basename} (date: ${formatDateISO(parsed.date)})`,
            'debug'
        )

        // Get applicable properties for this file
        const applicableDefinitions = recognitionService.getApplicableProperties(
            file,
            allDefinitions
        )

        log(
            `[WeeklySummary]   Applicable definitions: ${applicableDefinitions.length} (${applicableDefinitions.map((d) => d.name).join(', ')})`,
            'debug'
        )

        // Read frontmatter values
        const frontmatter = frontmatterService.read(file)

        log(
            `[WeeklySummary]   Frontmatter keys: ${Object.keys(frontmatter).join(', ') || '(empty)'}`,
            'debug'
        )

        // Collect values for relevant properties
        const values: Record<string, unknown> = {}
        const targetDefinitions = getTargetDefinitions(applicableDefinitions, includeProperties)

        log(
            `[WeeklySummary]   Target definitions (after type filter): ${targetDefinitions.length} (${targetDefinitions.map((d) => `${d.name}:${d.type}`).join(', ')})`,
            'debug'
        )

        if (targetDefinitions.length === 0) {
            skippedByNoProperties++
            log(
                `[WeeklySummary]   SKIPPED: no target definitions match for file ${file.basename}`,
                'debug'
            )
            continue
        }

        for (const def of targetDefinitions) {
            const key = findFrontmatterKey(frontmatter, def.name)
            if (key) {
                values[def.name] = frontmatter[key]
                log(
                    `[WeeklySummary]   Value found: ${def.name} = ${JSON.stringify(frontmatter[key])}`,
                    'debug'
                )
            } else {
                log(`[WeeklySummary]   Value NOT found in frontmatter: ${def.name}`, 'debug')
            }
        }

        if (Object.keys(values).length > 0) {
            noteDataList.push({
                filename: file.basename,
                date: parsed.date,
                values
            })
        } else {
            skippedByNoValues++
            log(
                `[WeeklySummary]   SKIPPED: no values found in frontmatter for ${file.basename}`,
                'debug'
            )
        }
    }

    // Log summary of filtering
    log(
        `[WeeklySummary] Filtering summary: ${allFiles.length} total files -> ${noteDataList.length} with data`,
        'debug'
    )
    log(`[WeeklySummary]   Skipped by tag filter: ${skippedByTag}`, 'debug')
    log(
        `[WeeklySummary]   Skipped by date parse (filename not YYYY-MM-DD): ${skippedByDateParse}`,
        'debug'
    )
    log(`[WeeklySummary]   Skipped by date range: ${skippedByDateRange}`, 'debug')
    log(`[WeeklySummary]   Skipped by no applicable properties: ${skippedByNoProperties}`, 'debug')
    log(`[WeeklySummary]   Skipped by no frontmatter values: ${skippedByNoValues}`, 'debug')

    // Sort by date
    noteDataList.sort((a, b) => a.date.getTime() - b.date.getTime())

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

    // Build the message for AI
    const userMessage = buildWeeklySummaryMessage(
        noteDataList,
        dateRange,
        plugin.settings.ai.weeklySummary.includeCsvData
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

/**
 * Check if a file has a specific tag in its frontmatter
 */
function fileHasTag(plugin: LifeTrackerPlugin, file: TFile, tag: string): boolean {
    const cache = plugin.app.metadataCache.getFileCache(file)
    if (!cache?.frontmatter) return false

    // Check frontmatter tags field
    const tags = cache.frontmatter['tags']

    if (Array.isArray(tags)) {
        const normalizedTag = tag.toLowerCase().replace(/^#/, '')
        return tags.some(
            (t: unknown) =>
                typeof t === 'string' && t.toLowerCase().replace(/^#/, '') === normalizedTag
        )
    }

    if (typeof tags === 'string') {
        const normalizedTag = tag.toLowerCase().replace(/^#/, '')
        return tags.split(/[,\s]+/).some((t) => t.toLowerCase().replace(/^#/, '') === normalizedTag)
    }

    return false
}

/**
 * Get the target property definitions based on include list
 */
function getTargetDefinitions(
    applicableDefinitions: PropertyDefinition[],
    includeProperties: string[]
): PropertyDefinition[] {
    if (includeProperties.length > 0) {
        // Filter to only the specified properties
        const lowerInclude = includeProperties.map((p) => p.toLowerCase())
        return applicableDefinitions.filter((d) => lowerInclude.includes(d.name.toLowerCase()))
    }

    // Auto-include: all numeric and boolean properties
    return applicableDefinitions.filter(
        (d) => d.type === 'number' || d.type === 'checkbox' || d.type === 'text'
    )
}

/**
 * Find a frontmatter key case-insensitively
 */
function findFrontmatterKey(
    frontmatter: Record<string, unknown>,
    name: string
): string | undefined {
    const lowerName = name.toLowerCase()
    return Object.keys(frontmatter).find((key) => key.toLowerCase() === lowerName)
}

/**
 * Build the user message for the weekly summary AI prompt
 */
function buildWeeklySummaryMessage(
    noteDataList: NoteData[],
    dateRange: { start: Date; end: Date },
    includeCsv: boolean
): string {
    const lines: string[] = []

    lines.push(
        `## Weekly data: ${formatDateISO(dateRange.start)} to ${formatDateISO(dateRange.end)}`
    )
    lines.push(`Total notes: ${noteDataList.length}`)
    lines.push('')

    // Compute averages for numeric properties
    const numericAverages = computeNumericAverages(noteDataList)

    if (Object.keys(numericAverages).length > 0) {
        lines.push('### Averages')
        for (const [prop, avg] of Object.entries(numericAverages)) {
            lines.push(
                `- ${prop}: ${avg.toFixed(2)} (from ${countNonNull(noteDataList, prop)} entries)`
            )
        }
        lines.push('')
    }

    // Per-day breakdown
    lines.push('### Daily values')
    for (const note of noteDataList) {
        lines.push(`**${note.filename}**`)
        for (const [key, value] of Object.entries(note.values)) {
            const displayValue =
                value === undefined || value === null
                    ? '(not set)'
                    : Array.isArray(value)
                      ? value.join(', ')
                      : String(value)
            lines.push(`  - ${key}: ${displayValue}`)
        }
    }

    // CSV data
    if (includeCsv) {
        lines.push('')
        lines.push('### CSV data')
        const csvData = buildCsvData(noteDataList)
        lines.push('```csv')
        lines.push(csvData)
        lines.push('```')
    }

    return lines.join('\n')
}

/**
 * Compute averages for all numeric properties across notes
 */
function computeNumericAverages(noteDataList: NoteData[]): Record<string, number> {
    const sums: Record<string, number> = {}
    const counts: Record<string, number> = {}

    for (const note of noteDataList) {
        for (const [key, value] of Object.entries(note.values)) {
            if (value === undefined || value === null) continue

            const numValue = typeof value === 'number' ? value : parseFloat(String(value))

            if (!isNaN(numValue)) {
                sums[key] = (sums[key] ?? 0) + numValue
                counts[key] = (counts[key] ?? 0) + 1
            } else if (typeof value === 'boolean') {
                sums[key] = (sums[key] ?? 0) + (value ? 1 : 0)
                counts[key] = (counts[key] ?? 0) + 1
            }
        }
    }

    const averages: Record<string, number> = {}
    for (const [key, sum] of Object.entries(sums)) {
        const count = counts[key]
        if (count && count > 0) {
            averages[key] = sum / count
        }
    }

    return averages
}

/**
 * Count non-null entries for a property
 */
function countNonNull(noteDataList: NoteData[], prop: string): number {
    return noteDataList.filter((n) => {
        const v = n.values[prop]
        return v !== undefined && v !== null
    }).length
}

/**
 * Build CSV data from the collected notes
 */
function buildCsvData(noteDataList: NoteData[]): string {
    if (noteDataList.length === 0) return ''

    // Collect all property names
    const allProps = new Set<string>()
    for (const note of noteDataList) {
        for (const key of Object.keys(note.values)) {
            allProps.add(key)
        }
    }

    const propList = Array.from(allProps).sort()

    // Header
    const header = ['date', ...propList].join(',')

    // Rows
    const rows = noteDataList.map((note) => {
        const dateStr = formatDateISO(note.date)
        const values = propList.map((prop) => {
            const value = note.values[prop]
            if (value === undefined || value === null) return ''
            if (typeof value === 'string' && value.includes(',')) return `"${value}"`
            if (Array.isArray(value)) return `"${value.join('; ')}"`
            return String(value)
        })
        return [dateStr, ...values].join(',')
    })

    return [header, ...rows].join('\n')
}
