import type { TickTickAPI } from '../api/TickTickAPI'
import type { TickTickToManualConverter } from './TickTickToManualConverter'
import type { ITask } from '../api/types/Task'
import type { IProject } from '../api/types/Project'

export interface SyncResult {
    success: boolean
    tasks?: ITask[]
    manualFormat?: string
    projects?: IProject[]
    error?: string
    tasksCompletedToday?: number
    totalXp?: number
}

export interface SyncStats {
    totalTasks: number
    completedTasks: number
    uncompletedTasks: number
    wontDoTasks: number
    totalXp: number
    projects: string[]
}

// Fixed XP values based on priority
const PRIORITY_TO_XP: Record<number, number> = {
    0: 5, // none
    1: 5, // low
    3: 15, // medium
    5: 25 // high
}

export class TickTickSyncService {
    private api: TickTickAPI
    private converter: TickTickToManualConverter

    constructor(api: TickTickAPI, converter: TickTickToManualConverter) {
        this.api = api
        this.converter = converter
    }

    async syncTasks(): Promise<SyncResult> {
        try {
            // Получаем все задачи с TickTick
            const tasks = await this.api.getAllTasks()

            // Получаем список проектов
            const projects = await this.api.getProjects()

            // Конвертируем в manual format
            const manualFormat = this.converter.convertTasksToManualFormat(tasks, projects)

            // Вычисляем статистику
            const stats = this.calculateStats(tasks, projects)

            return {
                success: true,
                tasks,
                manualFormat,
                projects,
                tasksCompletedToday: stats.completedTasks,
                totalXp: stats.totalXp
            }
        } catch (error) {
            console.error('TickTick sync failed:', error)
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown sync error'
            }
        }
    }

    async getTasksCompletedToday(): Promise<number> {
        try {
            const tasks = await this.api.getAllTasks()
            const today = new Date()
            today.setHours(0, 0, 0, 0)

            return tasks.filter((task) => {
                if (task.status !== 1) return false // only completed

                const taskDate = new Date(task.modifiedTime)
                taskDate.setHours(0, 0, 0, 0)
                return taskDate.getTime() === today.getTime()
            }).length
        } catch {
            console.error('Failed to get today tasks')
            return 0
        }
    }

    async getTotalXpToday(): Promise<number> {
        try {
            const tasks = await this.api.getAllTasks()
            const today = new Date()
            today.setHours(0, 0, 0, 0)

            return tasks
                .filter((task) => {
                    if (task.status !== 1) return false

                    const taskDate = new Date(task.modifiedTime)
                    taskDate.setHours(0, 0, 0, 0)
                    return taskDate.getTime() === today.getTime()
                })
                .reduce((total, task) => {
                    const xp = this.converter.extractXpFromTitle(task.title)
                    return total + (xp || this.getXpFromPriority(task.priority))
                }, 0)
        } catch {
            console.error('Failed to calculate XP')
            return 0
        }
    }

    async getStats(): Promise<SyncStats | null> {
        try {
            const tasks = await this.api.getAllTasks()
            const projects = await this.api.getProjects()
            return this.calculateStats(tasks, projects)
        } catch {
            console.error('Failed to get stats')
            return null
        }
    }

    async testConnection(): Promise<boolean> {
        try {
            await this.api.getUserStatus()
            return true
        } catch {
            console.error('Connection test failed')
            return false
        }
    }

    private calculateStats(tasks: ITask[], projects: IProject[]): SyncStats {
        const completedTasks = tasks.filter((t) => t.status === 1)
        const uncompletedTasks = tasks.filter((t) => t.status === 0)
        const wontDoTasks = tasks.filter((t) => t.status === 2)

        const totalXp = completedTasks.reduce((total, task) => {
            const xp = this.converter.extractXpFromTitle(task.title)
            return total + (xp || this.getXpFromPriority(task.priority))
        }, 0)

        const projectNames = Array.from(
            new Set(
                tasks.map(
                    (task) => projects.find((p) => p.id === task.projectId)?.name || 'No Project'
                )
            )
        )

        return {
            totalTasks: tasks.length,
            completedTasks: completedTasks.length,
            uncompletedTasks: uncompletedTasks.length,
            wontDoTasks: wontDoTasks.length,
            totalXp,
            projects: projectNames
        }
    }

    private getXpFromPriority(priority: number): number {
        return PRIORITY_TO_XP[priority] || 5
    }
}
