import { Notice } from 'obsidian'
import type { LifeTrackerPlugin } from '../plugin'
import { PropertyCaptureModal } from '../components/modals/property-capture-modal'
import { findOrCreateTodaysNote } from './today-utils'

/**
 * Register the "today's capture" command.
 * Finds (or auto-creates) today's daily note and opens the property capture
 * carousel on it.
 */
export function registerTodayCaptureCommand(plugin: LifeTrackerPlugin): void {
    plugin.addCommand({
        id: 'today-capture',
        name: "Today's capture",
        callback: () => {
            if (plugin.settings.propertyDefinitions.length === 0) {
                new Notice(
                    'No property definitions configured. Add them in Settings \u2192 Life Tracker \u2192 Property definitions.'
                )
                return
            }

            void findOrCreateTodaysNote(plugin).then((file) => {
                if (!file) return

                new PropertyCaptureModal(plugin, {
                    mode: 'single-note',
                    file
                }).open()
            })
        }
    })
}
