export interface IReminder {
    id: string
    trigger: string
}

export interface ITaskItem {
    id: string
    title: string
    status: number
}

export interface IPomodoroSummary {
    userId: number
    count: number
    estimatedPomo: number
    duration: number
}

export interface IFocusSummary {
    userId: number
    pomoCount: number
    estimatedPomo: number
    estimatedDuration: number
    pomoDuration: number
    stopwatchDuration: number
    focuses: (string | number)[][] // Array of [focusId, startTime?, durationSeconds]
}

export interface ITask {
    id: string
    projectId: string
    title: string
    content: string
    desc: string
    startDate: string | null
    dueDate: string | null
    completedTime: string | null
    timeZone: string
    isAllDay: boolean
    reminders: IReminder[]
    repeatFlag: string | null
    priority: number // 0=none, 1=low, 3=medium, 5=high
    status: number // 0=normal, 1=completed, 2=archived
    items: ITaskItem[]
    progress: number
    modifiedTime: string
    deleted: number
    tags: string[]
    childIds: string[]
    parentId: string | null
    sortOrder: number
    // Optional fields from different API endpoints
    pomodoroSummaries?: IPomodoroSummary[]
    focusSummaries?: IFocusSummary[]
}

export interface ISyncResponse {
    syncTaskBean?: {
        update: ITask[]
        delete: ITask[]
    }
    checkPoint: number
}

/**
 * Focus heatmap entry — one element per day in the range
 */
export interface IFocusHeatmapEntry {
    /** Total focus duration in minutes for that day */
    duration: number
}

/**
 * Focus distribution — maps tag/project names to total focus duration in minutes
 */
export type IFocusDistribution = Record<string, number>

/**
 * TickTick habit definition
 */
export interface IHabit {
    id: string
    name: string
    iconRes?: string
    color?: string
    sortOrder?: number
    /** 0=Active, 2=Archived */
    status?: number
    encouragement?: string
    totalCheckIns?: number
    currentStreak?: number
    createdTime?: string
    modifiedTime?: string
    archivedTime?: string
    /** "Boolean" = yes/no, "Real" = numeric */
    type?: 'Boolean' | 'Real'
    goal?: number
    step?: number
    unit?: string
    recordEnable?: boolean
    repeatRule?: string
    reminders?: string[]
    sectionId?: string
    targetDays?: number
    targetStartDate?: number
    completedCycles?: number
}

/**
 * Habit check-in record
 */
export interface IHabitCheckin {
    id: string
    habitId: string
    /** YYYYMMDD as integer (e.g. 20240115) */
    checkinStamp: number
    checkinTime: string
    opTime: string
    value: number
    goal: number
    status: number
}
