import { requestUrl } from 'obsidian'
import type { ITask, IFocusHeatmapEntry, IFocusDistribution } from '../api/types/Task'
import type { IProject } from '../api/types/Project'
import { parseTickTickTasks } from './TickTickDirectParser'

export interface TickTickAPIServiceConfig {
    token: string
    baseUrl?: string
}

export interface DateRange {
    from: string
    to: string
}

/**
 * Service for fetching and parsing TickTick data via API
 * Provides same output format as the existing Markdown parser
 */
export class TickTickAPIService {
    private token: string
    private baseUrl: string
    private apiUrl: string

    constructor(config: TickTickAPIServiceConfig) {
        this.token = config.token
        this.baseUrl = config.baseUrl || 'https://api.ticktick.com'
        this.apiUrl = `${this.baseUrl}/api/v2`
    }

    /**
     * Set a new API token
     */
    setToken(token: string): void {
        this.token = token
    }

    /**
     * Get current token (for debugging)
     */
    getToken(): string {
        return this.token
    }

    /**
     * Validate that the token is working by making a test request
     */
    async validateToken(): Promise<boolean> {
        try {
            // Try to get user projects - lightweight request
            await this.getProjects()
            return true
        } catch {
            return false
        }
    }

    /**
     * Get all projects for the user
     */
    async getProjects(): Promise<IProject[]> {
        const url = `${this.apiUrl}/projects`
        const response = await this.makeRequest(url, 'GET')
        return (response as IProject[]) || []
    }

    /**
     * Get completed tasks within a date range
     * Uses the /project/all/completed/ endpoint
     */
    async getCompletedTasks(dateRange: DateRange): Promise<ITask[]> {
        const params = new URLSearchParams({
            from: dateRange.from,
            to: dateRange.to,
            limit: '1000'
        })
        const url = `${this.apiUrl}/project/all/completed/?${params.toString()}`

        console.debug(`[TickTick] Fetching completed tasks: ${url}`)
        const response = await this.makeRequest(url, 'GET')

        // The response should be an array of tasks
        if (Array.isArray(response)) {
            console.debug(`[TickTick] Got ${response.length} completed tasks`)
            return response as ITask[]
        }

        // Handle case where response might be wrapped
        if (response && typeof response === 'object') {
            const tasks = (response as Record<string, unknown>)['tasks']
            if (Array.isArray(tasks)) {
                console.debug(`[TickTick] Got ${tasks.length} completed tasks (wrapped)`)
                return tasks as ITask[]
            }
        }

        console.debug('[TickTick] No completed tasks found')
        return []
    }

    /**
     * Get uncompleted tasks via the SYNC endpoint
     * TickTick has no dedicated "uncompleted" endpoint;
     * uncompleted tasks come from /batch/check/0 (syncTaskBean.update + syncTaskBean.add)
     * and are filtered by status === 0 (active/uncompleted)
     */
    async getUncompletedTasks(): Promise<ITask[]> {
        const url = `${this.apiUrl}/batch/check/0`

        console.debug(`[TickTick] Fetching uncompleted tasks via SYNC: ${url}`)
        const response = await this.makeRequest(url, 'GET')

        const tasks: ITask[] = []

        if (response && typeof response === 'object') {
            const syncData = response as Record<string, unknown>
            if (syncData['syncTaskBean'] && typeof syncData['syncTaskBean'] === 'object') {
                const taskBean = syncData['syncTaskBean'] as Record<string, unknown>

                // Collect from 'update' array (existing tasks)
                const updateTasks = taskBean['update']
                if (Array.isArray(updateTasks)) {
                    tasks.push(...(updateTasks as ITask[]))
                }

                // Collect from 'add' array (newly added tasks)
                const addTasks = taskBean['add']
                if (Array.isArray(addTasks)) {
                    tasks.push(...(addTasks as ITask[]))
                }
            }
        }

        // Filter to only uncompleted tasks (status 0 = normal/active)
        const uncompleted = tasks.filter((task) => task.status === 0)
        console.debug(
            `[TickTick] SYNC returned ${tasks.length} total tasks, ${uncompleted.length} uncompleted`
        )
        return uncompleted
    }

    /**
     * Get all tasks (including uncompleted)
     * Uses sync endpoint to get current state of all tasks
     */
    async getAllTasks(): Promise<ITask[]> {
        const url = `${this.apiUrl}/batch/check/0`

        const response = await this.makeRequest(url, 'GET')

        const tasks: ITask[] = []

        if (response && typeof response === 'object') {
            const syncData = response as Record<string, unknown>
            if (syncData['syncTaskBean'] && typeof syncData['syncTaskBean'] === 'object') {
                const taskBean = syncData['syncTaskBean'] as Record<string, unknown>

                const updateTasks = taskBean['update']
                if (Array.isArray(updateTasks)) {
                    tasks.push(...(updateTasks as ITask[]))
                }

                const addTasks = taskBean['add']
                if (Array.isArray(addTasks)) {
                    tasks.push(...(addTasks as ITask[]))
                }
            }
        }

        return tasks
    }

    /**
     * Get tasks for a specific date range
     * Combines completed tasks (from /project/all/closed) and uncompleted tasks (from SYNC)
     * If one endpoint fails, still returns results from the other
     */
    async getTasksForDateRange(dateRange: DateRange): Promise<ITask[]> {
        // Fetch completed and uncompleted tasks in parallel, with individual error handling
        const [completedResult, uncompletedResult] = await Promise.allSettled([
            this.getCompletedTasks(dateRange),
            this.getUncompletedTasks()
        ])

        const completedTasks = completedResult.status === 'fulfilled' ? completedResult.value : []
        const uncompletedTasks =
            uncompletedResult.status === 'fulfilled' ? uncompletedResult.value : []

        if (completedResult.status === 'rejected') {
            console.error('[TickTick] Failed to fetch completed tasks:', completedResult.reason)
        }
        if (uncompletedResult.status === 'rejected') {
            console.error('[TickTick] Failed to fetch uncompleted tasks:', uncompletedResult.reason)
        }

        console.debug(
            `[TickTick] Combined: ${completedTasks.length} completed + ${uncompletedTasks.length} uncompleted`
        )

        // Deduplicate by task id in case any task appears in both responses
        const taskMap = new Map<string, ITask>()
        for (const task of completedTasks) {
            taskMap.set(task.id, task)
        }
        for (const task of uncompletedTasks) {
            if (!taskMap.has(task.id)) {
                taskMap.set(task.id, task)
            }
        }

        return [...taskMap.values()]
    }

    /**
     * Convert "YYYY-MM-DD HH:mm:ss" date string to YYYYMMDD format
     * Required for focus/pomodoro endpoints
     */
    private toYYYYMMDD(dateStr: string): string {
        return dateStr.substring(0, 10).replace(/-/g, '')
    }

    /**
     * Get focus time heatmap for a date range.
     * Returns an array of durations (seconds) per day.
     * Uses V2 endpoint: /pomodoros/statistics/heatmap/{startYYYYMMDD}/{endYYYYMMDD}
     */
    async getFocusHeatmap(dateRange: DateRange): Promise<IFocusHeatmapEntry[]> {
        const startDate = this.toYYYYMMDD(dateRange.from)
        const endDate = this.toYYYYMMDD(dateRange.to)
        const url = `${this.apiUrl}/pomodoros/statistics/heatmap/${startDate}/${endDate}`

        console.debug(`[TickTick] Fetching focus heatmap: ${url}`)
        try {
            const response = await this.makeRequest(url, 'GET')
            if (Array.isArray(response)) {
                console.debug(`[TickTick] Got ${response.length} focus heatmap entries`)
                return response as IFocusHeatmapEntry[]
            }
            return []
        } catch (error) {
            console.debug('[TickTick] Focus heatmap fetch failed (may not be available):', error)
            return []
        }
    }

    /**
     * Get focus time distribution by tag/project for a date range.
     * Returns a map of tag/project name -> total duration in seconds.
     * Uses V2 endpoint: /pomodoros/statistics/dist/{startYYYYMMDD}/{endYYYYMMDD}
     */
    async getFocusDistribution(dateRange: DateRange): Promise<IFocusDistribution> {
        const startDate = this.toYYYYMMDD(dateRange.from)
        const endDate = this.toYYYYMMDD(dateRange.to)
        const url = `${this.apiUrl}/pomodoros/statistics/dist/${startDate}/${endDate}`

        console.debug(`[TickTick] Fetching focus distribution: ${url}`)
        try {
            const response = await this.makeRequest(url, 'GET')
            if (response && typeof response === 'object' && !Array.isArray(response)) {
                console.debug('[TickTick] Got focus distribution data')
                return response as IFocusDistribution
            }
            return {}
        } catch (error) {
            console.debug('[TickTick] Focus distribution fetch failed:', error)
            return {}
        }
    }

    /**
     * Main parsing function - fetches tasks and returns formatted result
     * Same output format as your existing TickTickInput script
     *
     * @param dateRange - Date range to fetch tasks for
     * @returns Parsed result object matching your existing parser format
     */
    async parseTasksForDateRange(dateRange: DateRange): Promise<Record<string, unknown>> {
        // Fetch tasks, projects, and focus data in parallel
        // Habits are already parsed from task tags in TickTickDirectParser
        const [tasks, projects, focusHeatmap, focusDistribution] = await Promise.all([
            this.getTasksForDateRange(dateRange),
            this.getProjects(),
            this.getFocusHeatmap(dateRange),
            this.getFocusDistribution(dateRange)
        ])

        // Parse using the direct parser (handles habits via task tags)
        const result = parseTickTickTasks(tasks, projects, dateRange)

        // Focus data — flat top-level keys for YAML frontmatter
        const totalFocusSeconds = focusHeatmap.reduce(
            (sum, entry) => sum + (entry.duration || 0),
            0
        )
        const focusMinutesFromHeatmap = Math.round(totalFocusSeconds / 60)
        const focusHoursFromHeatmap = Math.round((focusMinutesFromHeatmap / 60) * 100) / 100

        result['focus_total_seconds'] = totalFocusSeconds
        result['focus_total_minutes'] = focusMinutesFromHeatmap
        result['focus_total_hours'] = focusHoursFromHeatmap

        // Override focus_minutes/hours if heatmap gives better data
        if (focusMinutesFromHeatmap > 0) {
            result['focus_minutes'] = focusMinutesFromHeatmap
            result['focus_hours'] = focusHoursFromHeatmap
        }

        // Focus distribution — each category as focus_dist_<name>
        // Skip metadata keys (projectDurations, tagDurations, taskDurations) that
        // contain nested objects, not numeric seconds.
        const DIST_SKIP_KEYS = new Set(['projectDurations', 'tagDurations', 'taskDurations'])
        for (const [category, seconds] of Object.entries(focusDistribution)) {
            if (DIST_SKIP_KEYS.has(category)) continue
            const numSeconds = Number(seconds)
            if (isNaN(numSeconds)) continue
            const key = `focus_dist_${category.toLowerCase().replace(/\s+/g, '_')}`
            result[key] = Math.round(numSeconds / 60)
        }

        // Add input reference for debugging
        result['input'] = `TickTick API: ${dateRange.from} to ${dateRange.to}`

        console.debug(
            `[TickTick] Parse result: focus=${focusMinutesFromHeatmap}min, ` +
                `tasks=${tasks.length}`
        )

        return result
    }

    /**
     * Make authenticated request to TickTick API
     */
    private async makeRequest(url: string, method: string, body?: unknown): Promise<unknown> {
        const headers: Record<string, string> = {
            'Content-Type': 'application/json',
            'User-Agent': typeof navigator !== 'undefined' ? navigator.userAgent : 'Mozilla/5.0',
            'Cookie': `t=${this.token}`,
            't': this.token
        }

        try {
            const response = await requestUrl({
                url,
                method,
                headers,
                body: body ? JSON.stringify(body) : undefined
            })

            if (response.status !== 200) {
                throw new Error(`HTTP ${response.status}`)
            }

            return response.json
        } catch (error) {
            console.error('TickTick API Error:', error)
            throw error
        }
    }
}
