import { Notice } from 'obsidian'
import type { LifeTrackerPlugin } from '../plugin'
import { MealModal } from '../components/modals/meal-modal'

/**
 * Register the "scan food image" command.
 * Opens the meal modal directly on the image analysis view
 * for the currently active markdown file.
 *
 * This is a shortcut for the image-first workflow.
 */
export function registerScanFoodCommand(plugin: LifeTrackerPlugin): void {
    plugin.addCommand({
        id: 'scan-food',
        name: 'Scan food image',
        callback: () => {
            // Check AI is configured
            if (!plugin.settings.ai.enabled || !plugin.settings.ai.provider.apiKey) {
                new Notice('AI integration is not configured. Please set up AI in Settings first.')
                return
            }

            const activeFile = plugin.app.workspace.getActiveFile()

            if (!activeFile || activeFile.extension !== 'md') {
                new Notice('Please open a markdown file first')
                return
            }

            new MealModal(plugin, activeFile).open()
        }
    })
}
