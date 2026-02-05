import { requestUrl } from 'obsidian'
import type { ITask } from '../api/types/Task'
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
     * Uses the /project/all/completed endpoint
     */
    async getCompletedTasks(dateRange: DateRange): Promise<ITask[]> {
        const params = new URLSearchParams({
            from: dateRange.from,
            to: dateRange.to,
            limit: '1000'
        })
        const url = `${this.apiUrl}/project/all/completed/?${params.toString()}`

        const response = await this.makeRequest(url, 'GET')

        // The response should be an array of tasks
        if (Array.isArray(response)) {
            return response as ITask[]
        }

        // Handle case where response might be wrapped
        if (response && typeof response === 'object') {
            const tasks = (response as Record<string, unknown>)['tasks']
            if (Array.isArray(tasks)) {
                return tasks as ITask[]
            }
        }

        return []
    }

    /**
     * Get all tasks (including uncompleted)
     * Uses sync endpoint to get current state of all tasks
     */
    async getAllTasks(checkpoint?: number): Promise<ITask[]> {
        const cp = checkpoint ?? 0
        const url = `${this.apiUrl}/batch/check/0?cnt=${cp}`

        const response = await this.makeRequest(url, 'GET')

        // Handle sync response format
        if (response && typeof response === 'object') {
            const syncData = response as Record<string, unknown>
            if (syncData['syncTaskBean'] && typeof syncData['syncTaskBean'] === 'object') {
                const taskBean = syncData['syncTaskBean'] as Record<string, unknown>
                const tasks = taskBean['update']
                if (Array.isArray(tasks)) {
                    return tasks as ITask[]
                }
            }
        }

        return []
    }

    /**
     * Get tasks for a specific date range
     * Combines completed and uncompleted tasks
     */
    async getTasksForDateRange(dateRange: DateRange): Promise<ITask[]> {
        // Get completed tasks for the date range
        const completedTasks = await this.getCompletedTasks(dateRange)

        // Get all tasks to find uncompleted ones

        // Combine completed and uncompleted tasks
        return [...completedTasks]
    }

    /**
     * Main parsing function - fetches tasks and returns formatted result
     * Same output format as your existing TickTickInput script
     *
     * @param dateRange - Date range to fetch tasks for
     * @returns Parsed result object matching your existing parser format
     */
    async parseTasksForDateRange(dateRange: DateRange): Promise<Record<string, unknown>> {
        // Fetch all necessary data
        const [tasks, projects] = await Promise.all([
            this.getTasksForDateRange(dateRange),
            this.getProjects()
        ])

        // Parse using the direct parser
        const result = parseTickTickTasks(tasks, projects, dateRange)

        // Add input reference for debugging
        result['input'] = `TickTick API: ${dateRange.from} to ${dateRange.to}`

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
