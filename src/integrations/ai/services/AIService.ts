import { requestUrl } from 'obsidian'
import type { AIProviderConfig, AIAnalysisResult, AIProviderType } from '../types'
import { log } from '../../../utils'

/**
 * Default API base URLs per provider
 */
const DEFAULT_BASE_URLS: Record<AIProviderType, string> = {
    openai: 'https://api.openai.com/v1',
    openrouter: 'https://openrouter.ai/api/v1'
}

/**
 * OpenAI-compatible chat completion request body
 */
interface ChatCompletionRequest {
    model: string
    messages: Array<{
        role: 'system' | 'user' | 'assistant'
        content: string
    }>
    temperature?: number
    max_tokens?: number
}

/**
 * OpenAI-compatible chat completion response
 */
interface ChatCompletionResponse {
    choices: Array<{
        message: {
            content: string
        }
    }>
    usage?: {
        prompt_tokens: number
        completion_tokens: number
        total_tokens: number
    }
}

/**
 * AI service for communicating with LLM providers.
 * Supports OpenAI and OpenRouter (both use OpenAI-compatible API).
 */
export class AIService {
    private config: AIProviderConfig

    constructor(config: AIProviderConfig) {
        this.config = config
    }

    /**
     * Update the provider configuration
     */
    updateConfig(config: AIProviderConfig): void {
        this.config = config
    }

    /**
     * Get the effective base URL for the current provider
     */
    private getBaseUrl(): string {
        if (this.config.baseUrl.trim()) {
            return this.config.baseUrl.trim().replace(/\/$/, '')
        }
        return DEFAULT_BASE_URLS[this.config.type]
    }

    /**
     * Build request headers based on provider type
     */
    private getHeaders(): Record<string, string> {
        const headers: Record<string, string> = {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.config.apiKey}`
        }

        // OpenRouter requires additional headers
        if (this.config.type === 'openrouter') {
            headers['HTTP-Referer'] =
                'https://github.com/dsebastien/obsidian-life-tracker-base-view'
            headers['X-Title'] = 'Life Tracker for Obsidian'
        }

        return headers
    }

    /**
     * Send a chat completion request to the AI provider
     */
    async analyze(systemPrompt: string, userMessage: string): Promise<AIAnalysisResult> {
        if (!this.config.apiKey) {
            return {
                success: false,
                content: '',
                error: 'API key is not configured',
                provider: this.config.type,
                model: this.config.model
            }
        }

        const baseUrl = this.getBaseUrl()
        const url = `${baseUrl}/chat/completions`

        const body: ChatCompletionRequest = {
            model: this.config.model,
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userMessage }
            ],
            temperature: 0.7,
            max_tokens: 2000
        }

        try {
            log(`AI request to ${this.config.type}/${this.config.model}`, 'debug')

            const response = await requestUrl({
                url,
                method: 'POST',
                headers: this.getHeaders(),
                body: JSON.stringify(body),
                throw: false
            })

            if (response.status !== 200) {
                const errorBody = response.json as Record<string, unknown> | undefined
                const errorObj = errorBody?.['error'] as Record<string, unknown> | undefined
                const errorMessage = errorObj?.['message'] ?? `HTTP ${response.status}`
                log(`AI request failed: ${String(errorMessage)}`, 'error')
                return {
                    success: false,
                    content: '',
                    error: `AI request failed: ${String(errorMessage)}`,
                    provider: this.config.type,
                    model: this.config.model
                }
            }

            const data = response.json as ChatCompletionResponse
            const content = data.choices[0]?.message?.content ?? ''

            return {
                success: true,
                content,
                provider: this.config.type,
                model: this.config.model,
                usage: data.usage
                    ? {
                          promptTokens: data.usage.prompt_tokens,
                          completionTokens: data.usage.completion_tokens,
                          totalTokens: data.usage.total_tokens
                      }
                    : undefined
            }
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error'
            log(`AI request error: ${errorMessage}`, 'error')
            return {
                success: false,
                content: '',
                error: `AI request error: ${errorMessage}`,
                provider: this.config.type,
                model: this.config.model
            }
        }
    }

    /**
     * Test the connection by sending a simple prompt
     */
    async testConnection(): Promise<AIAnalysisResult> {
        return this.analyze(
            'You are a helpful assistant.',
            'Reply with exactly: "Connection successful!" and nothing else.'
        )
    }
}
