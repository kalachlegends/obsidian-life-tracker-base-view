import { Notice } from 'obsidian'
import type { LifeTrackerPlugin } from '../plugin'
import { DailyNoteModal } from '../components/modals/daily-note-modal'
import { findOrCreateTodaysNote } from './today-utils'

/**
 * Register the "today's daily capture" command.
 * Finds (or auto-creates) today's daily note and opens a form-style modal
 * showing all property fields at once.
 */
export function registerTodayDailyCaptureCommand(plugin: LifeTrackerPlugin): void {
    plugin.addCommand({
        id: 'today-daily-capture',
        name: "Today's daily capture (all fields)",
        callback: () => {
            if (plugin.settings.propertyDefinitions.length === 0) {
                new Notice(
                    'No property definitions configured. Add them in Settings \u2192 Life Tracker \u2192 Property definitions.'
                )
                return
            }

            void findOrCreateTodaysNote(plugin).then((file) => {
                if (!file) return

                new DailyNoteModal(plugin, file).open()
            })
        }
    })
}
