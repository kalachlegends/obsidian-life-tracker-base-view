import type { LifeTrackerPlugin } from '../plugin'
import { ThoughtsModal } from '../components/modals/thoughts-modal'
import { findTodaysNote } from './today-utils'

/**
 * Register the "today's thought" command.
 * Finds today's daily note (by YYYY-MM-DD filename in the configured folder)
 * and opens the thoughts capture modal on it.
 */
export function registerTodayThoughtCommand(plugin: LifeTrackerPlugin): void {
    plugin.addCommand({
        id: 'today-thought',
        name: "Today's thought",
        callback: () => {
            const file = findTodaysNote(plugin)
            if (!file) return

            new ThoughtsModal(plugin, file).open()
        }
    })
}
