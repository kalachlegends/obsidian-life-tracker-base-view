import type { LifeTrackerPlugin } from '../plugin'
import { registerCaptureCommand } from './capture-command'
import { registerDailyCaptureCommand } from './daily-capture-command'
import { registerThoughtCaptureCommand } from './thought-capture-command'
import { registerWeeklySummaryCommand } from './weekly-summary-command'

/**
 * Register all plugin commands
 */
export function registerCommands(plugin: LifeTrackerPlugin): void {
    registerCaptureCommand(plugin)
    registerDailyCaptureCommand(plugin)
    registerThoughtCaptureCommand(plugin)
    registerWeeklySummaryCommand(plugin)
}
