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
