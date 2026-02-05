export const ENDPOINTS = {
    login: 'user/signon?wc=true&remember=true',
    userStatus: 'user/status',
    userPreferences: 'user/preferences/settings',
    projects: 'projects',
    projectSections: 'column/project/{projectId}',
    tasks: 'batch/check/{checkpoint}',
    task: 'task/{taskId}',
    batchTask: 'batch/task',
    completedItems: 'project/all/completedInAll/',
    exportData: 'data/export',
    projectMove: 'batch/taskProject',
    parentMove: 'batch/taskParent'
} as const

export type EndpointKey = keyof typeof ENDPOINTS
