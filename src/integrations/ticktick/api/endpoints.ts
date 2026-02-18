export const ENDPOINTS = {
    login: 'user/signon?wc=true&remember=true',
    userStatus: 'user/status',
    userPreferences: 'user/preferences/settings',
    projects: 'projects',
    projectSections: 'column/project/{projectId}',
    sync: 'batch/check/0',
    tasks: 'batch/check/{checkpoint}',
    task: 'task/{taskId}',
    batchTask: 'batch/task',
    completedItems: 'project/all/completedInAll/',
    projectAllClosed: 'project/all/closed',
    projectAllCompleted: 'project/all/completed',
    projectAllTrashPagination: 'project/all/trash/pagination',
    exportData: 'data/export',
    projectMove: 'batch/taskProject',
    parentMove: 'batch/taskParent',
    /** Focus heatmap: /pomodoros/statistics/heatmap/{startYYYYMMDD}/{endYYYYMMDD} */
    focusHeatmap: 'pomodoros/statistics/heatmap/{startDate}/{endDate}',
    /** Focus distribution: /pomodoros/statistics/dist/{startYYYYMMDD}/{endYYYYMMDD} */
    focusDistribution: 'pomodoros/statistics/dist/{startDate}/{endDate}',
    /** List all habits */
    habits: 'habits',
    /** Batch create/update/delete habit checkins */
    habitCheckins: 'habitCheckins/batch'
} as const

export type EndpointKey = keyof typeof ENDPOINTS
