import type { LifeTrackerPlugin } from '../plugin'
import { MealModal } from '../components/modals/meal-modal'
import { DailyNoteSuggestModal } from '../components/modals/daily-note-suggest-modal'

/**
 * Register the "today's meal" command.
 * Opens a daily note picker (most recent first) and then opens
 * the meal capture modal on the selected note.
 * If today's note doesn't exist, a "create" option is shown at the top.
 */
export function registerTodayMealCommand(plugin: LifeTrackerPlugin): void {
    plugin.addCommand({
        id: 'today-meal',
        name: "Today's meal",
        callback: () => {
            new DailyNoteSuggestModal(plugin, (file) => {
                new MealModal(plugin, file).open()
            }).open()
        }
    })
}
