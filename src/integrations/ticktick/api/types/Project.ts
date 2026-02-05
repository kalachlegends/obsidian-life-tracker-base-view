export interface IProject {
    id: string
    name: string
    color: string
    sortOrder: number
    modifiedTime: string
    closed: boolean
    groupId: string | null
    viewMode: string
}

export interface ISection {
    id: string
    projectId: string
    name: string
    sortOrder: number
}
