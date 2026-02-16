import { requestUrl } from 'obsidian'
import { ENDPOINTS } from './endpoints'
import type { IAuthResponse, ILoginCredentials, IUserStatus, IXDevice } from './types/Auth'
import type { ITask } from './types/Task'
import type { IProject } from './types/Project'

interface ISyncTaskBean {
    update: ITask[]
    delete: ITask[]
}

interface ISyncResponse {
    syncTaskBean: ISyncTaskBean
    checkPoint: number
}

export class TickTickAPI {
    private token: string
    private apiUrl: string = 'https://api.ticktick.com/api/v2'
    private checkpoint: number = 0
    private inboxId: string = ''
    private cookieHeader: string = ''
    private deviceId: string

    constructor(token: string = '') {
        this.token = token
        this.deviceId = this.generateRandomDeviceId()
    }

    public setToken(token: string): void {
        this.token = token
    }

    public setInboxId(inboxId: string): void {
        this.inboxId = inboxId
    }

    public getInboxId(): string {
        return this.inboxId
    }

    public getToken(): string {
        return this.token
    }

    public getCheckpoint(): number {
        return this.checkpoint
    }

    public setCheckpoint(checkpoint: number): void {
        this.checkpoint = checkpoint
    }

    async login(credentials: ILoginCredentials): Promise<IAuthResponse> {
        const url = `${this.apiUrl}/${ENDPOINTS.login}`
        const headers = this.createLoginHeaders()
        const body = {
            username: credentials.username,
            password: credentials.password
        }

        const response = await requestUrl({
            url,
            method: 'POST',
            headers,
            body: JSON.stringify(body)
        })

        if (response.status !== 200) {
            throw new Error(`Login failed: HTTP ${response.status}`)
        }

        const data = response.json as IAuthResponse
        this.token = data.token
        this.inboxId = data.inboxId

        // Сохранить cookies из ответа
        const cookies = response.headers['set-cookie']
        if (cookies) {
            this.cookieHeader = Array.isArray(cookies) ? cookies.join('; ') : cookies
        }

        return data
    }

    async getUserStatus(): Promise<IUserStatus> {
        const url = `${this.apiUrl}/${ENDPOINTS.userStatus}`
        return (await this.makeRequest(url, 'GET')) as IUserStatus
    }

    async getProjects(): Promise<IProject[]> {
        const url = `${this.apiUrl}/${ENDPOINTS.projects}`
        const response = await this.makeRequest(url, 'GET')
        return (response as IProject[]) || []
    }

    async getProjectSections(
        projectId: string
    ): Promise<Array<{ id: string; projectId: string; name: string; sortOrder: number }>> {
        const url = `${this.apiUrl}/${ENDPOINTS.projectSections.replace('{projectId}', projectId)}`
        const response = await this.makeRequest(url, 'GET')
        return (
            (response as Array<{
                id: string
                projectId: string
                name: string
                sortOrder: number
            }>) || []
        )
    }

    /**
     * Get uncompleted tasks via the SYNC endpoint
     * Fetches all tasks from /batch/check/0 and filters to status === 0 (active/uncompleted)
     */
    async getUncompletedTasks(): Promise<ITask[]> {
        const url = `${this.apiUrl}/${ENDPOINTS.sync}`
        const response = await this.makeRequest(url, 'GET')

        const tasks: ITask[] = []
        const syncResponse = response as ISyncResponse & {
            syncTaskBean: ISyncTaskBean & { add?: ITask[] }
        }

        if (syncResponse?.syncTaskBean) {
            if (syncResponse.syncTaskBean.update) {
                tasks.push(...syncResponse.syncTaskBean.update)
            }
            if (syncResponse.syncTaskBean.add) {
                tasks.push(...syncResponse.syncTaskBean.add)
            }
        }

        return tasks.filter((task) => task.status === 0)
    }

    /**
     * Get completed tasks via the /project/all/closed endpoint
     */
    async getCompletedTasks(from: string, to: string, limit: number = 1000): Promise<ITask[]> {
        const params = new URLSearchParams({
            from,
            to,
            status: 'Completed',
            limit: limit.toString()
        })
        const url = `${this.apiUrl}/${ENDPOINTS.projectAllClosed}?${params.toString()}`
        const response = await this.makeRequest(url, 'GET')

        if (Array.isArray(response)) {
            return response as ITask[]
        }

        if (response && typeof response === 'object') {
            const tasks = (response as Record<string, unknown>)['tasks']
            if (Array.isArray(tasks)) {
                return tasks as ITask[]
            }
        }

        return []
    }

    async getAllTasks(): Promise<ITask[]> {
        const url = `${this.apiUrl}/${ENDPOINTS.sync}`
        const response = await this.makeRequest(url, 'GET')

        const tasks: ITask[] = []
        const syncResponse = response as ISyncResponse & {
            syncTaskBean: ISyncTaskBean & { add?: ITask[] }
        }

        if (syncResponse?.syncTaskBean) {
            this.checkpoint = syncResponse.checkPoint
            if (syncResponse.syncTaskBean.update) {
                tasks.push(...syncResponse.syncTaskBean.update)
            }
            if (syncResponse.syncTaskBean.add) {
                tasks.push(...syncResponse.syncTaskBean.add)
            }
        }

        return tasks
    }

    async getTask(taskId: string, projectId?: string): Promise<ITask | null> {
        let url = `${this.apiUrl}/${ENDPOINTS.task.replace('{taskId}', taskId)}`
        if (projectId) {
            url += `?projectID=${projectId}`
        }
        return (await this.makeRequest(url, 'GET')) as ITask | null
    }

    async addTask(taskData: Partial<ITask>): Promise<ITask> {
        const task: ITask = {
            id: taskData.id || this.generateObjectId(),
            projectId: taskData.projectId || this.inboxId,
            title: taskData.title || '',
            content: taskData.content || '',
            desc: taskData.desc || '',
            startDate: taskData.startDate || null,
            dueDate: taskData.dueDate || null,
            timeZone: taskData.timeZone || 'America/New_York',
            isAllDay: taskData.isAllDay ?? true,
            reminders: taskData.reminders || [
                {
                    id: this.generateObjectId(),
                    trigger: 'TRIGGER:PT0S'
                }
            ],
            repeatFlag: taskData.repeatFlag || null,
            priority: taskData.priority || 0,
            status: taskData.status || 0,
            items: taskData.items || [],
            progress: taskData.progress || 0,
            completedTime: taskData.completedTime || null,
            modifiedTime: new Date().toISOString().replace('Z', '+0000'),
            deleted: 0,
            tags: taskData.tags || [],
            childIds: taskData.childIds || [],
            parentId: taskData.parentId || null,
            sortOrder: taskData.sortOrder || 0
        }

        const url = `${this.apiUrl}/${ENDPOINTS.task.replace('{taskId}', '')}`
        return (await this.makeRequest(url, 'POST', task)) as ITask
    }

    async updateTask(task: ITask): Promise<unknown> {
        const payload = {
            add: [],
            addAttachments: [],
            delete: [],
            deleteAttachments: [],
            updateAttachments: [],
            update: [task]
        }

        const url = `${this.apiUrl}/${ENDPOINTS.batchTask}`
        return await this.makeRequest(url, 'POST', payload)
    }

    async deleteTask(taskId: string, projectId: string): Promise<unknown> {
        const payload = {
            add: [],
            addAttachments: [],
            delete: [{ taskId, projectId }],
            deleteAttachments: [],
            updateAttachments: [],
            update: []
        }

        const url = `${this.apiUrl}/${ENDPOINTS.batchTask}`
        return await this.makeRequest(url, 'POST', payload)
    }

    async moveTaskProject(
        taskId: string,
        fromProjectId: string,
        toProjectId: string
    ): Promise<unknown> {
        const payload = [
            {
                fromProjectId,
                toProjectId,
                taskId,
                sortOrder: 0
            }
        ]

        const url = `${this.apiUrl}/${ENDPOINTS.projectMove}`
        return await this.makeRequest(url, 'POST', payload)
    }

    private async makeRequest(url: string, method: string, body?: unknown): Promise<unknown> {
        try {
            const headers = this.createAuthHeaders()

            const response = await requestUrl({
                url,
                method,
                headers,
                body: body ? JSON.stringify(body) : undefined
            })

            if (response.status !== 200) {
                throw new Error(`HTTP ${response.status}`)
            }

            // Сохранить cookies из ответа
            const cookies = response.headers['set-cookie']
            if (cookies) {
                this.cookieHeader = Array.isArray(cookies) ? cookies.join('; ') : cookies
            }

            return response.json
        } catch (error) {
            console.error('API Error:', error)
            throw error
        }
    }

    private createLoginHeaders(): Record<string, string> {
        return {
            'Accept': '*/*',
            'x-device': this.getXDevice(),
            'Content-Type': 'application/json',
            'X-Requested-With': 'XMLHttpRequest'
        }
    }

    private createAuthHeaders(): Record<string, string> {
        return {
            'Content-Type': 'application/json',
            'User-Agent': typeof navigator !== 'undefined' ? navigator.userAgent : 'Mozilla/5.0',
            'x-device': this.getXDevice(),
            'Cookie': `t=${this.token};${this.cookieHeader}`,
            't': this.token
        }
    }

    getXDevice(): string {
        const xDevice: IXDevice = {
            platform: 'web',
            os: 'Windows 10',
            device: 'Firefox 117.0',
            name: '',
            version: 6070,
            id: this.deviceId,
            channel: 'website',
            campaign: '',
            websocket: ''
        }
        return JSON.stringify(xDevice)
    }

    private generateRandomDeviceId(): string {
        // 24-hex символов с префиксом '66'
        const chars = '0123456789abcdef'
        let id = '66'
        for (let i = 0; i < 22; i++) {
            id += chars[Math.floor(Math.random() * chars.length)]
        }
        return id
    }

    generateObjectId(): string {
        const timestamp = Math.floor(Date.now() / 1000)
            .toString(16)
            .padStart(8, '0')
        const machineId = Math.floor(Math.random() * 16777216)
            .toString(16)
            .padStart(6, '0')
        const processId = Math.floor(Math.random() * 65536)
            .toString(16)
            .padStart(4, '0')
        const counter = Math.floor(Math.random() * 16777216)
            .toString(16)
            .padStart(6, '0')
        return timestamp + machineId + processId + counter
    }

    getInitialCheckpoint(): number {
        const date = new Date()
        date.setDate(date.getDate() - 15) // 15 дней назад
        return date.getTime()
    }
}
