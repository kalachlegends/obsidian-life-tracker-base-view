import type { LifeTrackerPlugin } from '../plugin'
import { registerCaptureCommand } from './capture-command'
import { registerDailyCaptureCommand } from './daily-capture-command'
import { registerThoughtCaptureCommand } from './thought-capture-command'
import { registerDailySummaryCommand } from './daily-summary-command'
import { registerWeeklySummaryCommand } from './weekly-summary-command'
import { registerMonthlySummaryCommand } from './monthly-summary-command'

/**
 * Register all plugin commands
 */
export function registerCommands(plugin: LifeTrackerPlugin): void {
    registerCaptureCommand(plugin)
    registerDailyCaptureCommand(plugin)
    registerThoughtCaptureCommand(plugin)
    registerDailySummaryCommand(plugin)
    registerWeeklySummaryCommand(plugin)
    registerMonthlySummaryCommand(plugin)
}
