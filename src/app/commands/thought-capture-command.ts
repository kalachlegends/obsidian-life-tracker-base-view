import { Notice } from 'obsidian'
import type { LifeTrackerPlugin } from '../plugin'
import { ThoughtsModal } from '../components/modals/thoughts-modal'

/**
 * Register the thought capture command.
 * Opens a dedicated modal for quickly jotting down thoughts throughout the day.
 */
export function registerThoughtCaptureCommand(plugin: LifeTrackerPlugin): void {
    plugin.addCommand({
        id: 'capture-thought',
        name: 'Capture thought',
        callback: () => {
            const activeFile = plugin.app.workspace.getActiveFile()

            if (!activeFile || activeFile.extension !== 'md') {
                new Notice('Please open a markdown file first')
                return
            }

            new ThoughtsModal(plugin, activeFile).open()
        }
    })
}
