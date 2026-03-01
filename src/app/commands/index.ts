import type { LifeTrackerPlugin } from '../plugin'
import { registerCaptureCommand } from './capture-command'
import { registerDailyCaptureCommand } from './daily-capture-command'
import { registerThoughtCaptureCommand } from './thought-capture-command'
import { registerTodayCaptureCommand } from './today-capture-command'
import { registerTodayDailyCaptureCommand } from './today-daily-capture-command'
import { registerTodayThoughtCommand } from './today-thought-command'
import { registerMealCaptureCommand } from './meal-capture-command'
import { registerTodayMealCommand } from './today-meal-command'
import { registerScanFoodCommand } from './scan-food-command'
import { registerSyncTickTickCommand } from './sync-ticktick-command'
import { registerSyncHCGatewayCommand } from './sync-hcgateway-command'
import { registerAnalyzeNoteCommand } from './analyze-note-command'
import { registerSummaryCommand } from './summary-command'

/**
 * Register all plugin commands
 */
export function registerCommands(plugin: LifeTrackerPlugin): void {
    // Capture commands
    registerCaptureCommand(plugin)
    registerDailyCaptureCommand(plugin)
    registerThoughtCaptureCommand(plugin)
    registerMealCaptureCommand(plugin)

    // Today's note commands (auto-find today's note)
    registerTodayCaptureCommand(plugin)
    registerTodayDailyCaptureCommand(plugin)
    registerTodayThoughtCommand(plugin)
    registerTodayMealCommand(plugin)

    // Standalone sync commands
    registerSyncTickTickCommand(plugin)
    registerSyncHCGatewayCommand(plugin)

    // AI commands
    registerAnalyzeNoteCommand(plugin)
    registerSummaryCommand(plugin)
    registerScanFoodCommand(plugin)
}
