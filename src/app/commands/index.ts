import type { LifeTrackerPlugin } from '../plugin'
import { registerCaptureCommand } from './capture-command'
import { registerWeeklySummaryCommand } from './weekly-summary-command'

/**
 * Register all plugin commands
 */
export function registerCommands(plugin: LifeTrackerPlugin): void {
    registerCaptureCommand(plugin)
    registerWeeklySummaryCommand(plugin)
}
