import type { LifeTrackerPlugin } from '../plugin'
import { registerCaptureCommand } from './capture-command'
import { registerDailyCaptureCommand } from './daily-capture-command'
import { registerThoughtCaptureCommand } from './thought-capture-command'
import { registerTodayCaptureCommand } from './today-capture-command'
import { registerTodayDailyCaptureCommand } from './today-daily-capture-command'
import { registerTodayThoughtCommand } from './today-thought-command'
import { registerSyncTickTickCommand } from './sync-ticktick-command'
import { registerSyncHCGatewayCommand } from './sync-hcgateway-command'
import { registerAnalyzeNoteCommand } from './analyze-note-command'
import { registerDailySummaryCommand } from './daily-summary-command'
import { registerWeeklySummaryCommand } from './weekly-summary-command'
import { registerMonthlySummaryCommand } from './monthly-summary-command'

/**
 * Register all plugin commands
 */
export function registerCommands(plugin: LifeTrackerPlugin): void {
    // Capture commands
    registerCaptureCommand(plugin)
    registerDailyCaptureCommand(plugin)
    registerThoughtCaptureCommand(plugin)

    // Today's note commands (auto-find today's note)
    registerTodayCaptureCommand(plugin)
    registerTodayDailyCaptureCommand(plugin)
    registerTodayThoughtCommand(plugin)

    // Standalone sync commands
    registerSyncTickTickCommand(plugin)
    registerSyncHCGatewayCommand(plugin)

    // AI commands
    registerAnalyzeNoteCommand(plugin)
    registerDailySummaryCommand(plugin)
    registerWeeklySummaryCommand(plugin)
    registerMonthlySummaryCommand(plugin)
}
