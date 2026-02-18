import { getAllTags, type TFile } from 'obsidian'
import type { LifeTrackerPlugin } from '../plugin'
import { FrontmatterService } from '../services/frontmatter.service'
import { parseDateFromFilename, formatDateISO } from '../../utils/date.utils'
import { isWithinInterval } from 'date-fns'
import { log } from '../../utils'

/**
 * Data collected for a single note in the summary
 */
export interface NoteData {
    filename: string
    date: Date
    values: Record<string, unknown>
}

/**
 * Summary period type for logging and display
 */
export type SummaryPeriod = 'daily' | 'weekly' | 'monthly'

/**
 * Collect and filter notes for a given date range and tag filter.
 * Shared by both weekly and monthly summary commands.
 */
export function collectNotesForDateRange(
    plugin: LifeTrackerPlugin,
    dateRange: { start: Date; end: Date },
    filterTag: string,
    period: SummaryPeriod
): NoteData[] {
    const label =
        period === 'daily'
            ? 'DailySummary'
            : period === 'weekly'
              ? 'WeeklySummary'
              : 'MonthlySummary'
    const frontmatterService = new FrontmatterService(plugin.app)
    const tag = filterTag.trim()

    log(`[${label}] Filter tag: "${tag || '(none)'}"`, 'debug')

    const allFiles = plugin.app.vault.getMarkdownFiles()

    log(`[${label}] Total markdown files in vault: ${allFiles.length}`, 'debug')

    // Frontmatter keys to exclude (Obsidian internals)
    const EXCLUDED_KEYS = new Set(['position', 'cssclasses', 'cssclass'])

    const noteDataList: NoteData[] = []

    // Debug counters
    let skippedByTag = 0
    let skippedByDateParse = 0
    let skippedByDateRange = 0
    let skippedByNoValues = 0

    for (const file of allFiles) {
        // Filter by tag if configured
        if (tag && !fileHasTag(plugin, file, tag)) {
            if (skippedByTag < 3) {
                const cache = plugin.app.metadataCache.getFileCache(file)
                const fileTags = cache ? getAllTags(cache) : null
                log(
                    `[${label}] Tag filter skipped "${file.basename}": file tags=${JSON.stringify(fileTags)}, looking for="${tag}"`,
                    'debug'
                )
            }
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
        if (
            !isWithinInterval(parsed.date, {
                start: dateRange.start,
                end: dateRange.end
            })
        ) {
            skippedByDateRange++
            continue
        }

        log(
            `[${label}] Processing file: ${file.basename} (date: ${formatDateISO(parsed.date)})`,
            'debug'
        )

        // Read ALL frontmatter values
        const frontmatter = frontmatterService.read(file)

        log(
            `[${label}]   Frontmatter keys: ${Object.keys(frontmatter).join(', ') || '(empty)'}`,
            'debug'
        )

        // Collect all non-internal frontmatter values
        const values: Record<string, unknown> = {}

        for (const [key, value] of Object.entries(frontmatter)) {
            if (EXCLUDED_KEYS.has(key)) continue
            if (value === null || value === undefined) continue
            values[key] = value
            log(`[${label}]   ${key} = ${JSON.stringify(value)}`, 'debug')
        }

        if (Object.keys(values).length > 0) {
            noteDataList.push({
                filename: file.basename,
                date: parsed.date,
                values
            })
        } else {
            skippedByNoValues++
            log(`[${label}]   SKIPPED: empty frontmatter for ${file.basename}`, 'debug')
        }
    }

    // Log summary of filtering
    log(
        `[${label}] Filtering summary: ${allFiles.length} total -> ${noteDataList.length} with data`,
        'debug'
    )
    log(`[${label}]   Skipped by tag filter: ${skippedByTag}`, 'debug')
    log(`[${label}]   Skipped by date parse: ${skippedByDateParse}`, 'debug')
    log(`[${label}]   Skipped by date range: ${skippedByDateRange}`, 'debug')
    log(`[${label}]   Skipped by empty frontmatter: ${skippedByNoValues}`, 'debug')

    // Sort by date ascending
    noteDataList.sort((a, b) => a.date.getTime() - b.date.getTime())

    return noteDataList
}

/**
 * Build the user message for an AI summary prompt.
 * Works for both weekly and monthly summaries.
 */
export function buildSummaryMessage(
    noteDataList: NoteData[],
    dateRange: { start: Date; end: Date },
    includeCsv: boolean,
    periodLabel: string
): string {
    const lines: string[] = []

    lines.push(
        `## ${periodLabel} data: ${formatDateISO(dateRange.start)} to ${formatDateISO(dateRange.end)}`
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

    // Undone tasks summary across all notes
    const undoneKeys = [
        'tasks_undone',
        'sprint_tasks_undone',
        'habits_undone',
        'task_count_undone',
        'total_habits_undone'
    ]
    const hasUndoneData = noteDataList.some((note) =>
        undoneKeys.some((key) => {
            const val = note.values[key]
            if (val === undefined || val === null) return false
            if (Array.isArray(val)) return val.length > 0
            if (typeof val === 'number') return val > 0
            return false
        })
    )

    if (hasUndoneData) {
        lines.push('### Undone tasks')
        for (const note of noteDataList) {
            const undoneEntries: string[] = []
            for (const key of undoneKeys) {
                const val = note.values[key]
                if (val === undefined || val === null) continue
                if (Array.isArray(val) && val.length > 0) {
                    undoneEntries.push(`  - ${key}: ${val.join(', ')}`)
                } else if (typeof val === 'number' && val > 0) {
                    undoneEntries.push(`  - ${key}: ${val}`)
                }
            }
            if (undoneEntries.length > 0) {
                lines.push(`**${note.filename}**`)
                lines.push(...undoneEntries)
            }
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
 * Check if a file has a specific tag (searches frontmatter tags AND inline tags).
 * Uses Obsidian's getAllTags() which returns normalized tags with '#' prefix.
 */
function fileHasTag(plugin: LifeTrackerPlugin, file: TFile, tag: string): boolean {
    const cache = plugin.app.metadataCache.getFileCache(file)
    if (!cache) return false

    const allTags = getAllTags(cache)
    if (!allTags || allTags.length === 0) return false

    const normalizedTag = '#' + tag.toLowerCase().replace(/^#/, '')

    return allTags.some((t) => t.toLowerCase() === normalizedTag)
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
