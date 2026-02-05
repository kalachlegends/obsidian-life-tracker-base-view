import type { TickTickAPI } from '../api/TickTickAPI'
import type { ILoginCredentials, IAuthResponse } from '../api/types/Auth'

export interface AuthState {
    isAuthenticated: boolean
    token: string | null
    inboxId: string | null
    lastError: string | null
}

export class TickTickAuthService {
    private api: TickTickAPI
    private state: AuthState = {
        isAuthenticated: false,
        token: null,
        inboxId: null,
        lastError: null
    }

    constructor(api: TickTickAPI) {
        this.api = api
    }

    getState(): AuthState {
        return { ...this.state }
    }

    isAuthenticated(): boolean {
        return this.state.isAuthenticated
    }

    async login(credentials: ILoginCredentials): Promise<boolean> {
        try {
            const response = await this.api.login(credentials)
            this.updateStateFromResponse(response)
            return true
        } catch (error) {
            this.state.lastError = error instanceof Error ? error.message : 'Unknown error'
            this.state.isAuthenticated = false
            console.error('TickTick login failed:', error)
            return false
        }
    }

    async validateToken(): Promise<boolean> {
        if (!this.state.token) {
            return false
        }

        try {
            // Попробуем получить статус пользователя для проверки токена
            await this.api.getUserStatus()
            return true
        } catch (error) {
            console.error('Token validation failed:', error)
            this.state.isAuthenticated = false
            this.state.lastError = 'Token expired or invalid'
            return false
        }
    }

    restoreSession(token: string, inboxId: string): void {
        this.api.setToken(token)
        this.api.setInboxId(inboxId)
        this.state.token = token
        this.state.inboxId = inboxId
        this.state.isAuthenticated = true
        this.state.lastError = null
    }

    clearSession(): void {
        this.api.setToken('')
        this.api.setInboxId('')
        this.state = {
            isAuthenticated: false,
            token: null,
            inboxId: null,
            lastError: null
        }
    }

    getAuthData(): { token: string | null; inboxId: string | null } {
        return {
            token: this.state.token,
            inboxId: this.state.inboxId
        }
    }

    private updateStateFromResponse(response: IAuthResponse): void {
        this.state.token = response.token
        this.state.inboxId = response.inboxId
        this.state.isAuthenticated = true
        this.state.lastError = null
    }
}
