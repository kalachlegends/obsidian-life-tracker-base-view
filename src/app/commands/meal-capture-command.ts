import { Notice } from 'obsidian'
import type { LifeTrackerPlugin } from '../plugin'
import { MealModal } from '../components/modals/meal-modal'

/**
 * Register the "log meal" command.
 * Opens the meal capture modal on the currently active markdown file.
 */
export function registerMealCaptureCommand(plugin: LifeTrackerPlugin): void {
    plugin.addCommand({
        id: 'log-meal',
        name: 'Log meal',
        callback: () => {
            const activeFile = plugin.app.workspace.getActiveFile()

            if (!activeFile || activeFile.extension !== 'md') {
                new Notice('Please open a markdown file first')
                return
            }

            new MealModal(plugin, activeFile).open()
        }
    })
}
