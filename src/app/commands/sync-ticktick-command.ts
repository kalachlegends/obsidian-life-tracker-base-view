import { Notice } from 'obsidian'
import type { LifeTrackerPlugin } from '../plugin'
import { FrontmatterService } from '../services/frontmatter.service'
import { log } from '../../utils'

/**
 * Register the "Sync TickTick" command.
 * Fetches TickTick data for the active file's date and writes it to frontmatter.
 * Works independently of the capture modal.
 */
export function registerSyncTickTickCommand(plugin: LifeTrackerPlugin): void {
    plugin.addCommand({
        id: 'sync-ticktick',
        name: 'Sync TickTick data',
        callback: () => {
            void executeSyncTickTick(plugin)
        }
    })
}

async function executeSyncTickTick(plugin: LifeTrackerPlugin): Promise<void> {
    // Check integration is enabled and authenticated
    if (!plugin.settings.ticktick.enabled) {
        new Notice(
            'TickTick integration is not enabled. Enable it in Settings \u2192 Integrations.'
        )
        return
    }

    const token = plugin.settings.ticktick.token
    if (!token) {
        new Notice(
            'TickTick is not authenticated. Log in via Settings \u2192 Integrations \u2192 TickTick.'
        )
        return
    }

    const file = plugin.app.workspace.getActiveFile()
    if (!file || file.extension !== 'md') {
        new Notice('Please open a markdown file first')
        return
    }

    log(`[SyncTickTick] Fetching data for ${file.basename}`, 'debug')
    new Notice('Fetching TickTick data...')

    try {
        const { getTickTickDateRangeFromFilename } = await import('../../utils/date.utils')
        const { TickTickAPIService } =
            await import('../../integrations/ticktick/services/TickTickAPIService')

        const tickTickTimeZone = plugin.settings.ticktick.timeZone
        const dateRange = getTickTickDateRangeFromFilename(file.basename, tickTickTimeZone)

        if (!dateRange) {
            new Notice(
                `Cannot parse date from "${file.basename}" \u2014 TickTick sync requires a date-based filename`
            )
            return
        }

        log(
            `[SyncTickTick] Date range: ${dateRange.from} to ${dateRange.to}, timeZone=${tickTickTimeZone}`,
            'debug'
        )

        const apiService = new TickTickAPIService({ token })
        const result = await apiService.parseTasksForDateRange(dateRange, tickTickTimeZone)

        log(`[SyncTickTick] Data received: ${JSON.stringify(result)}`, 'debug')

        // Write to frontmatter
        const updates: Record<string, unknown> = {}
        for (const [key, value] of Object.entries(result)) {
            updates[key] = value
        }

        if (Object.keys(updates).length > 0) {
            const frontmatterService = new FrontmatterService(plugin.app)
            await frontmatterService.write(file, updates)
            log(`[SyncTickTick] Saved to frontmatter: ${Object.keys(updates).join(', ')}`, 'debug')
            new Notice(
                `TickTick data saved: ${String(result['task_count_done'] ?? 0)} tasks, ${String(result['xp'] ?? 0)} XP`
            )
        } else {
            new Notice('TickTick: no data found for this date')
        }
    } catch (error) {
        log(`[SyncTickTick] Error: ${String(error)}`, 'error')
        console.error('[SyncTickTick] Error:', error)
        new Notice(
            `TickTick sync error: ${error instanceof Error ? error.message : 'Unknown error'}`
        )
    }
}
