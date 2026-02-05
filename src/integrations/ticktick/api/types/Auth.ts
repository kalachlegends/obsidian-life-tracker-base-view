export interface IAuthResponse {
    token: string
    inboxId: string
}

export interface ILoginCredentials {
    username: string
    password: string
}

export interface IUserStatus {
    id: string
    inboxId: string
    pro: boolean
    proEndDate: string | null
    defaultTimeZone: string
    teamPro: boolean
}

export interface IXDevice {
    platform: string
    os: string
    device: string
    name: string
    version: number
    id: string
    channel: string
    campaign: string
    websocket: string
}
