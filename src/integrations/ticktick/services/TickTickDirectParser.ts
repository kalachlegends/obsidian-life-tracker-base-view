import type { ITask } from '../api/types/Task'
import type { IProject } from '../api/types/Project'

/**
 * Result structure matching the existing Markdown parser output
 */
export interface TickTickParserResult {
    tasks_done: string[]
    tasks_wont_do: string[]
    tasks_undone: string[]
    task_count_done: number
    task_count_wont_do: number
    task_count_undone: number
    habits_done: string[]
    habits_undone: string[]
    total_habits_done: number
    total_habits_undone: number
    habits_by_category: Record<string, boolean>
    score: number
    xp: number
    total_minus_xp: number
    rewards: string[]
    routines: string[]
    sprint_tasks_done: string[]
    sprint_tasks_undone: string[]
    current_sprint: string | null
    current_xp: number
    projects: string[]
    summary: string[]
    xp_by_category: Record<string, number>
    date_parsed: string | null
    focus_efficiency: number
    focus_hours: number
    focus_minutes: number
    input?: string
}

/**
 * Project statistics accumulator
 */
interface ProjectStats {
    project: string
    done: number
    undone: number
    total_xp: number
    total_pomodoros: number
    total_minutes: number
}

/**
 * Category/tag statistics accumulator
 */
interface CategoryStats {
    category: string
    done: number
    undone: number
    total_xp: number
}

/**
 * Format minutes as "Xh Ym" or "Ym"
 */
function formatTime(minutes: number): string {
    const h = Math.floor(minutes / 60)
    const m = minutes % 60
    return h > 0 ? `${h}h ${m}m` : `${m}m`
}

/**
 * Clean project name by removing emojis and extra spaces
 */
function cleanProjectName(projectName: string): string {
    return projectName
        .replace(/[\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]/gu, '')
        .replace(/⚒️/gu, '')
        .replace(/🇬🇧/gu, '')
        .replace(/🎁/gu, '')
        .trim()
}

/**
 * Extract XP from task text or tags
 * Priority: tags array first, then title text patterns
 */
function extractXP(task: ITask): number {
    // Check tags first for XP values
    if (task.tags && task.tags.length > 0) {
        for (const tag of task.tags) {
            const tagMatch = tag.match(/^(-?\d+)xp$/)
            if (tagMatch) {
                const value = tagMatch[1]
                if (value) {
                    return parseInt(value)
                }
            }
        }
    }

    // Check title for #15xp patterns
    const titleMatches = [...task.title.matchAll(/#(-?\d+)xp/g)]
    if (titleMatches.length > 0) {
        return titleMatches.reduce((sum, m) => {
            const value = m[1]
            return sum + (value ? parseInt(value) : 0)
        }, 0)
    }

    // Check content for XP patterns
    const contentMatches = [...(task.content || '').matchAll(/#(-?\d+)xp/g)]
    if (contentMatches.length > 0) {
        return contentMatches.reduce((sum, m) => {
            const value = m[1]
            return sum + (value ? parseInt(value) : 0)
        }, 0)
    }

    // Default XP based on priority
    const priorityXP: Record<number, number> = {
        0: 1, // none - default to 1
        1: 5, // low
        3: 10, // medium
        5: 15 // high
    }
    return priorityXP[task.priority] || 1
}

/**
 * Extract pomodoro count from task
 */
function extractPomodoros(task: ITask): number {
    // Check pomodoroSummaries
    if (task.pomodoroSummaries && task.pomodoroSummaries.length > 0) {
        return task.pomodoroSummaries.reduce((sum: number, pomo) => sum + (pomo.count || 0), 0)
    }

    // Check title for Pomo×N pattern
    const pomoMatches = [...task.title.matchAll(/Pomo×(\d+)/g)]
    return pomoMatches.reduce((sum: number, m) => {
        const value = m[1]
        return sum + (value ? parseInt(value) : 0)
    }, 0)
}

/**
 * Extract focus minutes from focusSummaries
 */
function extractFocusMinutes(task: ITask): number {
    if (!task.focusSummaries || task.focusSummaries.length === 0) {
        return 0
    }

    let totalSeconds = 0
    for (const summary of task.focusSummaries) {
        if (summary.focuses && summary.focuses.length > 0) {
            for (const focus of summary.focuses) {
                // focus is array: [focusId, startTime?, durationInSeconds]
                if (focus.length >= 3) {
                    const duration = focus[2]
                    totalSeconds +=
                        typeof duration === 'number' ? duration : parseInt(String(duration)) || 0
                }
            }
        }
    }

    return Math.round(totalSeconds / 60)
}

/**
 * Extract tags from task (from tags array and title patterns)
 */
function extractTags(task: ITask): string[] {
    const tags: string[] = []

    // Add tags from tags array
    if (task.tags && task.tags.length > 0) {
        tags.push(...task.tags)
    }

    // Extract tags from title (e.g., #habit_english)
    const titleTags = [...task.title.matchAll(/#(\w+)/g)]
    for (const match of titleTags) {
        const tag = match[1]
        if (tag && !tags.includes(tag)) {
            tags.push(tag)
        }
    }

    return tags
}

/**
 * Check if task is a habit based on tags
 */
function isHabitTask(tags: string[]): boolean {
    return tags.some((tag) => tag === 'habit' || tag.startsWith('habit_'))
}

/**
 * Get habit category from tags
 */
function getHabitCategory(tags: string[]): string | null {
    const habitTag = tags.find((tag) => tag.startsWith('habit_'))
    return habitTag || null
}

/**
 * Check if task is a reward
 */
function isRewardTask(tags: string[]): boolean {
    return tags.includes('reward')
}

/**
 * Check if task is a routine
 */
function isRoutineTask(tags: string[]): boolean {
    return tags.includes('routine')
}

/**
 * Check if task is a sprint task
 */
function isSprintTask(tags: string[]): { isSprint: boolean; sprintTag: string | null } {
    const sprintTag = tags.find((tag) => tag.startsWith('sprint'))
    return { isSprint: !!sprintTag, sprintTag: sprintTag || null }
}

/**
 * Format a TickTick date string to a short display format.
 * Input: "2026-02-18T09:00:00.000+0000" or ISO string
 * Output: "2026-02-18 09:00" or "2026-02-18" (all-day)
 */
function formatTaskDate(dateStr: string | null): string | null {
    if (!dateStr) return null
    try {
        const d = new Date(dateStr)
        if (isNaN(d.getTime())) return null
        const date = d.toISOString().substring(0, 10)
        const time = d.toISOString().substring(11, 16)
        // If time is midnight, it's likely an all-day task
        return time === '00:00' ? date : `${date} ${time}`
    } catch {
        return null
    }
}

/**
 * Build task text representation similar to Markdown parser
 */
function buildTaskText(task: ITask, projectName: string, tags: string[]): string {
    let text = task.title

    // Add XP if not in title
    if (!text.includes('xp')) {
        const xp = extractXP(task)
        if (xp !== 1 || task.priority > 0) {
            text += ` #${xp}xp`
        }
    }

    // Add time if has focus data
    const minutes = extractFocusMinutes(task)
    const pomos = extractPomodoros(task)
    if (minutes > 0 || pomos > 0) {
        const timeStr = formatTime(minutes)
        if (pomos > 0) {
            text += ` (Pomo×${pomos} ${timeStr})`
        } else {
            text += ` (${timeStr})`
        }
    }

    // Add date range (startDate -> dueDate)
    const start = formatTaskDate(task.startDate)
    const due = formatTaskDate(task.dueDate)
    if (start && due) {
        text += ` [${start} → ${due}]`
    } else if (due) {
        text += ` [due: ${due}]`
    } else if (start) {
        text += ` [start: ${start}]`
    }

    // Add project
    const cleanProj = cleanProjectName(projectName)
    text += ` <${cleanProj}>`

    // Add tags not already in text
    for (const tag of tags) {
        if (!text.includes(`#${tag}`)) {
            text += ` #${tag}`
        }
    }

    return text
}

/**
 * Get project name from projectId
 */
function getProjectName(projectId: string, projects: IProject[]): string {
    const project = projects.find((p) => p.id === projectId)
    const name = project?.name || 'No Project'
    return name.toLowerCase().includes('inbox') ? 'Inbox' : name
}

/**
 * Main parser function - converts TickTick API tasks to the same format as Markdown parser
 *
 * @param tasks - Array of TickTick tasks (can be from completed or all tasks endpoint)
 * @param projects - Array of TickTick projects for name mapping
 * @param dateRange - Optional date range for filtering
 * @returns ParserResult with the same structure as the existing Markdown parser
 */
export function parseTickTickAPI(
    tasks: ITask[],
    projects: IProject[],
    dateRange?: { from: string; to: string }
): TickTickParserResult {
    // Initialize result with same structure as Markdown parser
    const result: TickTickParserResult = {
        tasks_done: [],
        tasks_wont_do: [],
        tasks_undone: [],
        task_count_done: 0,
        task_count_wont_do: 0,
        task_count_undone: 0,
        habits_done: [],
        habits_undone: [],
        total_habits_done: 0,
        total_habits_undone: 0,
        habits_by_category: {},
        score: 0,
        xp: 0,
        total_minus_xp: 0,
        rewards: [],
        routines: [],
        sprint_tasks_done: [],
        sprint_tasks_undone: [],
        current_sprint: null,
        current_xp: 0,
        projects: [],
        summary: [],
        xp_by_category: {},
        date_parsed: dateRange ? `${dateRange.from} - ${dateRange.to}` : null,
        focus_efficiency: 0,
        focus_hours: 0,
        focus_minutes: 0
    }

    const projectsMap: Record<string, ProjectStats> = {}
    const summaryMap: Record<string, CategoryStats> = {}

    // Filter tasks by date range if provided
    let filteredTasks = tasks
    if (dateRange) {
        const fromDate = new Date(dateRange.from)
        const toDate = new Date(dateRange.to)
        filteredTasks = tasks.filter((task) => {
            // For completed tasks, use completedTime
            if (task.completedTime) {
                const completed = new Date(task.completedTime)
                return completed >= fromDate && completed <= toDate
            }
            // For undone tasks, check dueDate or startDate to see if
            // the task is relevant to this date range
            const due = task.dueDate ? new Date(task.dueDate) : null
            const start = task.startDate ? new Date(task.startDate) : null
            if (due && start) {
                // Task overlaps with range if it starts before range end
                // and is due after range start
                return start <= toDate && due >= fromDate
            }
            if (due) {
                return due >= fromDate && due <= toDate
            }
            if (start) {
                return start >= fromDate && start <= toDate
            }
            // No date at all — skip for date-filtered queries
            return false
        })
    }

    for (const task of filteredTasks) {
        const projectName = getProjectName(task.projectId, projects)
        const tags = extractTags(task)
        const xp = extractXP(task)
        const pomos = extractPomodoros(task)
        const minutes = extractFocusMinutes(task)

        // Determine task status
        // TickTick API: status 0=active/undone, 2=completed, -1=won't do
        const isCompleted = task.status === 2
        const isWontDo = task.status === -1
        const isUndone = task.status === 0

        // Check special categories
        const habitCategory = getHabitCategory(tags)
        const isHabit = isHabitTask(tags)
        const isReward = isRewardTask(tags)
        const isRoutine = isRoutineTask(tags)
        const { isSprint, sprintTag } = isSprintTask(tags)

        // Build task text
        const taskText = buildTaskText(task, projectName, tags)

        // Distribute to appropriate arrays
        if (isWontDo) {
            result.tasks_wont_do.push(taskText)
            result.task_count_wont_do++
            result.score += xp

            if (xp < 0) {
                result.total_minus_xp += Math.abs(xp)
            }
        } else if (isCompleted) {
            if (isSprint) {
                result.sprint_tasks_done.push(taskText)
                if (!result.current_sprint && sprintTag) {
                    result.current_sprint = sprintTag
                }
            } else {
                result.tasks_done.push(taskText)
                result.task_count_done++
            }

            result.score += xp
            result.focus_minutes += minutes

            if (xp < 0) {
                result.total_minus_xp += Math.abs(xp)
            }

            if (isHabit) {
                result.habits_done.push(taskText)
                result.total_habits_done++

                if (habitCategory) {
                    result.habits_by_category[habitCategory] = true
                }
            }

            if (isReward) {
                result.rewards.push(taskText)
            }

            if (isRoutine) {
                result.routines.push(taskText)
            }
        } else if (isUndone) {
            if (isSprint) {
                result.sprint_tasks_undone.push(taskText)
                if (!result.current_sprint && sprintTag) {
                    result.current_sprint = sprintTag
                }
            } else {
                result.tasks_undone.push(taskText)
                result.task_count_undone++
            }

            if (isHabit) {
                result.habits_undone.push(taskText)
                result.total_habits_undone++

                if (habitCategory && !(habitCategory in result.habits_by_category)) {
                    result.habits_by_category[habitCategory] = false
                }
            }
        }

        // Track project statistics
        if (!projectsMap[projectName]) {
            projectsMap[projectName] = {
                project: projectName,
                done: 0,
                undone: 0,
                total_xp: 0,
                total_pomodoros: 0,
                total_minutes: 0
            }
        }

        if (isCompleted || isWontDo) {
            projectsMap[projectName].done++
            projectsMap[projectName].total_xp += xp
            projectsMap[projectName].total_pomodoros += pomos
            projectsMap[projectName].total_minutes += minutes
        } else {
            projectsMap[projectName].undone++
        }

        // Track category statistics
        for (const tag of tags) {
            if (!summaryMap[tag]) {
                summaryMap[tag] = {
                    category: tag,
                    done: 0,
                    undone: 0,
                    total_xp: 0
                }
            }

            if (isCompleted || isWontDo) {
                summaryMap[tag].done++
                summaryMap[tag].total_xp += xp
            } else {
                summaryMap[tag].undone++
            }
        }

        // Track XP by category (project)
        if (!result.xp_by_category[projectName]) {
            result.xp_by_category[projectName] = 0
        }
        if (isCompleted || isWontDo) {
            result.xp_by_category[projectName] += xp
        }
    }

    // Format projects as text
    result.projects = Object.values(projectsMap).map(
        (proj) => `${cleanProjectName(proj.project)}: ${proj.done} done, ${proj.undone} undone`
    )

    // Format summary as text
    result.summary = Object.values(summaryMap).map(
        (item) => `${item.category}: done ${item.done}, undone ${item.undone}, xp ${item.total_xp}`
    )

    // Update XP_by_category with correct totals
    result.xp_by_category = {}
    Object.entries(projectsMap).forEach(([project, proj]) => {
        result.xp_by_category[cleanProjectName(project)] = proj.total_xp
    })

    // Calculate final metrics
    result.xp = result.score - result.total_minus_xp
    result.focus_hours = Math.round((result.focus_minutes / 60) * 100) / 100
    result.focus_efficiency =
        result.focus_hours > 0 ? Math.round((result.xp / result.focus_hours) * 100) / 100 : 0
    result.current_xp = result.xp

    return result
}

/**
 * Post-process result to match exact output format of your TickTickInput script
 * This flattens category data and cleans up the result object
 */
export function postProcessResult(result: TickTickParserResult): Record<string, unknown> {
    // Merge category data into result
    const processedResult: Record<string, unknown> = {
        ...result,
        ...result.xp_by_category,
        ...result.habits_by_category
    }

    // Update current_xp
    processedResult['current_xp'] = result.xp

    // Merge summary and projects
    processedResult['summary'] = [...result.summary, ...result.projects]

    // Delete keys that shouldn't be in final output
    const keysToDelete = [
        'date_parsed',
        'habits_by_category',
        'sprint_tasks',
        'projects',
        'summary'
    ]

    for (const key of keysToDelete) {
        delete processedResult[key]
    }

    return processedResult
}

/**
 * Complete parsing pipeline
 * Same interface as your TickTickInput script
 */
export function parseTickTickTasks(
    tasks: ITask[],
    projects: IProject[],
    dateRange?: { from: string; to: string }
): Record<string, unknown> {
    const parsed = parseTickTickAPI(tasks, projects, dateRange)
    return postProcessResult(parsed)
}
