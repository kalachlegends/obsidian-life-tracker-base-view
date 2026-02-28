import type { LifeTrackerPlugin } from '../plugin'
import { SummaryModal } from '../components/modals/summary-modal'

/**
 * Register the unified summary command that opens a modal
 * allowing the user to pick period (day/week/month/custom) and generate AI summaries.
 */
export function registerSummaryCommand(plugin: LifeTrackerPlugin): void {
    plugin.addCommand({
        id: 'generate-summary',
        name: 'Generate summary with AI',
        callback: () => {
            new SummaryModal(plugin).open()
        }
    })
}
