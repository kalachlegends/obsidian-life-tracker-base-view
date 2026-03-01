import type { LifeTrackerPlugin } from '../plugin'
import { ThoughtsModal } from '../components/modals/thoughts-modal'
import { findOrCreateTodaysNote } from './today-utils'

/**
 * Register the "today's thought" command.
 * Finds (or auto-creates) today's daily note and opens the thoughts capture
 * modal on it.
 */
export function registerTodayThoughtCommand(plugin: LifeTrackerPlugin): void {
    plugin.addCommand({
        id: 'today-thought',
        name: "Today's thought",
        callback: () => {
            void findOrCreateTodaysNote(plugin).then((file) => {
                if (!file) return

                new ThoughtsModal(plugin, file).open()
            })
        }
    })
}
