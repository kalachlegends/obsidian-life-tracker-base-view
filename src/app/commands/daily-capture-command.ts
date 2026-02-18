import { Notice } from 'obsidian'
import type { LifeTrackerPlugin } from '../plugin'
import { DailyNoteModal } from '../components/modals/daily-note-modal'

/**
 * Register the daily capture command.
 * Opens a form-style modal showing all property fields at once for the active note.
 */
export function registerDailyCaptureCommand(plugin: LifeTrackerPlugin): void {
    plugin.addCommand({
        id: 'daily-capture',
        name: 'Daily capture (all fields)',
        callback: () => {
            if (plugin.settings.propertyDefinitions.length === 0) {
                new Notice(
                    'No property definitions configured. Add them in Settings \u2192 Life Tracker \u2192 Property definitions.'
                )
                return
            }

            const activeFile = plugin.app.workspace.getActiveFile()

            if (!activeFile || activeFile.extension !== 'md') {
                new Notice('Please open a markdown file first')
                return
            }

            new DailyNoteModal(plugin, activeFile).open()
        }
    })
}
