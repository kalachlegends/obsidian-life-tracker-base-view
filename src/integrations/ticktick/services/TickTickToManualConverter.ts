import type { ITask } from '../api/types/Task'
import type { IProject } from '../api/types/Project'

export interface ProjectMapping {
    [tickTickProjectName: string]: string
}

// Default XP values based on priority: high=15, medium=10, low=5, none=1
const PRIORITY_TO_XP: Record<number, number> = {
    0: 1, // none
    1: 5, // low
    3: 10, // medium
    5: 15 // high
}

const DEFAULT_XP = 1

export class TickTickToManualConverter {
    private projectMapping: ProjectMapping

    constructor(projectMapping?: ProjectMapping) {
        this.projectMapping = projectMapping || {}
    }

    convertTasksToManualFormat(tasks: ITask[], projects: IProject[], date?: string): string {
        const completedTasks: string[] = []
        const uncompletedTasks: string[] = []
        const wontDoTasks: string[] = []

        for (const task of tasks) {
            const projectName = this.getProjectName(task.projectId, projects)
            const taskLine = this.buildTaskLine(task, projectName)

            if (task.status === 1) {
                // completed
                completedTasks.push(taskLine)
            } else if (task.status === 2) {
                // archived (wont do)
                wontDoTasks.push(taskLine)
            } else {
                // normal (uncompleted)
                uncompletedTasks.push(taskLine)
            }
        }

        return this.formatAsManualInput(completedTasks, wontDoTasks, uncompletedTasks, date)
    }

    private buildTaskLine(task: ITask, projectName: string): string {
        let line = task.title

        // Добавляем XP если его нет в заголовке
        const existingXp = this.extractXpFromTitle(task.title)
        if (existingXp === null) {
            const xp = this.getXpForTask(task)
            line += ` #${xp}xp`
        }

        // Добавляем время если есть в заголовке
        const timeMatch = task.title.match(/\(Pomo×\d+.*\)/)
        if (!timeMatch) {
            // Попробуем извлечь время из контента или desc
            const minutes = this.extractMinutes(task.content) || this.extractMinutes(task.desc)
            if (minutes > 0) {
                const formattedTime = this.formatTime(minutes)
                line += ` (${formattedTime})`
            }
        }

        // Добавляем проект
        const mappedProject = this.projectMapping[projectName] || projectName
        line += ` <${mappedProject}>`

        // Добавляем теги на основе приоритета и других данных TickTick
        if (task.priority > 0) {
            line += ` #priority${task.priority}`
        }

        if (task.isAllDay) {
            line += ` #allday`
        }

        return line
    }

    private getXpForTask(task: ITask): number {
        const existingXp = this.extractXpFromTitle(task.title)
        if (existingXp !== null) {
            return existingXp
        }
        return PRIORITY_TO_XP[task.priority] || DEFAULT_XP
    }

    extractXpFromTitle(title: string): number | null {
        // Ищем #10xp или #15xp в заголовке
        const xpMatches = [...title.matchAll(/#(-?\d+)xp/g)]
        if (xpMatches.length > 0) {
            return xpMatches.reduce((sum, match) => sum + parseInt(match[1] || '0'), 0)
        }
        return null
    }

    extractMinutes(text: string): number {
        let minutes = 0

        // Ищем #45min
        const hashMinutes = [...text.matchAll(/#(\d+)min/g)]
        for (const match of hashMinutes) {
            minutes += parseInt(match[1] || '0')
        }

        // Ищем 2h30m
        const timeFormat = [...text.matchAll(/(\d+)h(\d+)m/g)]
        for (const match of timeFormat) {
            minutes += parseInt(match[1] || '0') * 60 + parseInt(match[2] || '0')
        }

        return minutes
    }

    private formatTime(minutes: number): string {
        const h = Math.floor(minutes / 60)
        const m = minutes % 60
        return h > 0 ? `${h}h${m}m` : `${m}m`
    }

    private getProjectName(projectId: string, projects: IProject[]): string {
        const project = projects.find((p) => p.id === projectId)
        return project?.name || 'No Project'
    }

    private formatAsManualInput(
        completed: string[],
        wontDo: string[],
        uncompleted: string[],
        date?: string
    ): string {
        const lines: string[] = []

        // Дата
        const dateStr =
            date || new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric' })
        lines.push(`# ${dateStr}`)
        lines.push('')

        // Completed section
        if (completed.length > 0) {
            lines.push('## Completed')
            for (const task of completed) {
                lines.push(`- [x] ${task}`)
            }
            lines.push('')
        }

        // Won't Do section
        if (wontDo.length > 0) {
            lines.push("## Won't Do")
            for (const task of wontDo) {
                lines.push(`- [x] ${task}`)
            }
            lines.push('')
        }

        // Uncompleted section
        if (uncompleted.length > 0) {
            lines.push('## Uncompleted')
            for (const task of uncompleted) {
                lines.push(`- [ ] ${task}`)
            }
            lines.push('')
        }

        return lines.join('\n')
    }
}
