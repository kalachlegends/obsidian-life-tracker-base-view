import { Notice } from 'obsidian'
import type { LifeTrackerPlugin } from '../plugin'
import { PropertyCaptureModal } from '../components/modals/property-capture-modal'
import { findTodaysNote } from './today-utils'

/**
 * Register the "today's capture" command.
 * Finds today's daily note (by YYYY-MM-DD filename in the configured folder)
 * and opens the property capture carousel on it.
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

            const file = findTodaysNote(plugin)
            if (!file) return

            new PropertyCaptureModal(plugin, {
                mode: 'single-note',
                file
            }).open()
        }
    })
}
