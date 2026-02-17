/**
 * Anthropic Claude AI Provider
 * 使用 Anthropic Messages API（通过 Electron IPC 代理请求）
 */

import type { AIProvider, ModelInfo, QuotaInfo, ProviderMeta } from '../types'
import { PROVIDER_INFO } from '../types'
import { aiFetch } from '../fetch-helper'

// Claude 模型配置
const CLAUDE_MODELS: Record<string, ModelInfo> = {
  'claude-sonnet-4-20250514': {
    name: 'Claude Sonnet 4',
    description: '最新一代 Sonnet，智能与速度完美平衡',
    contextWindow: 200000,
    recommended: true
  },
  'claude-3-5-sonnet-20241022': {
    name: 'Claude 3.5 Sonnet',
    description: '上一代旗舰，性价比极高',
    contextWindow: 200000,
    recommended: false
  },
  'claude-3-opus-20240229': {
    name: 'Claude 3 Opus',
    description: '最强推理能力，适合复杂任务',
    contextWindow: 200000,
    recommended: false
  },
  'claude-3-haiku-20240307': {
    name: 'Claude 3 Haiku',
    description: '速度最快，成本最低',
    contextWindow: 200000,
    recommended: false
  }
}

const DEFAULT_MODEL = 'claude-sonnet-4-20250514'
const API_BASE = 'https://api.anthropic.com/v1'
const API_VERSION = '2023-06-01'

export class ClaudeProvider implements AIProvider {
  readonly type = 'claude' as const
  readonly meta: ProviderMeta = PROVIDER_INFO.claude

  private apiKey: string = ''
  private currentModel: string = DEFAULT_MODEL
  private initialized: boolean = false

  async init(apiKey: string, modelName?: string): Promise<boolean> {
    try {
      if (modelName && modelName in CLAUDE_MODELS) {
        this.currentModel = modelName
      }

      this.apiKey = apiKey
      this.initialized = true
      console.log(`✅ Claude initialized with model: ${this.currentModel}`)
      return true
    } catch (error) {
      console.error('❌ Failed to initialize Claude:', error)
      return false
    }
  }

  async generateText(
    prompt: string,
    retries: number = 2,
    _timeout: number = 60000
  ): Promise<string> {
    if (!this.initialized || !this.apiKey) {
      throw new Error('Claude API 未初始化，请先在设置中配置 API Key')
    }

    let lastError: any = null

    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        console.log(`[Claude API] 请求尝试 ${attempt + 1}/${retries + 1}`)

        const response = await aiFetch(`${API_BASE}/messages`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': this.apiKey,
            'anthropic-version': API_VERSION
          },
          body: JSON.stringify({
            model: this.currentModel,
            max_tokens: 8192,
            messages: [{ role: 'user', content: prompt }]
          })
        })

        if (!response.ok) {
          const errorMsg = response.data?.error?.message || response.error || `HTTP ${response.status}`
          throw new Error(errorMsg)
        }

        const text = response.data?.content?.[0]?.text || ''

        console.log(`[Claude API] 请求成功`)
        return text

      } catch (error: any) {
        lastError = error
        const errorMsg = error.message || String(error)
        console.error(`[Claude API] 请求失败 (尝试 ${attempt + 1}/${retries + 1}):`, errorMsg)

        if (attempt === retries) break

        if (errorMsg.includes('429') || errorMsg.includes('rate limit')) {
          throw new Error('⚠️ API 配额已用尽，请稍后重试')
        }

        if (errorMsg.includes('401') || errorMsg.includes('invalid')) {
          throw new Error('❌ API Key 无效，请检查全局设置')
        }

        const waitTime = Math.min(2000 * (attempt + 1), 5000)
        console.log(`[Claude API] ${waitTime}ms 后重试...`)
        await new Promise(resolve => setTimeout(resolve, waitTime))
      }
    }

    const errorMsg = lastError?.message || String(lastError)
    if (errorMsg.includes('fetch') || errorMsg.includes('network')) {
      throw new Error('🌐 网络连接失败，请检查网络设置')
    }

    throw new Error(`生成失败: ${errorMsg}`)
  }

  async *generateTextStream(prompt: string): AsyncGenerator<string, void, unknown> {
    if (!this.initialized || !this.apiKey) {
      throw new Error('Claude API 未初始化，请先在设置中配置 API Key')
    }

    const response = await fetch(`${API_BASE}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': API_VERSION
      },
      body: JSON.stringify({
        model: this.currentModel,
        max_tokens: 8192,
        messages: [{ role: 'user', content: prompt }],
        stream: true
      })
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      throw new Error(errorData.error?.message || `HTTP ${response.status}`)
    }

    const reader = response.body?.getReader()
    if (!reader) throw new Error('无法获取响应流')

    const decoder = new TextDecoder()
    let buffer = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6)
          try {
            const json = JSON.parse(data)
            if (json.type === 'content_block_delta' && json.delta?.text) {
              yield json.delta.text
            }
          } catch {
            // Skip invalid JSON
          }
        }
      }
    }
  }

  async switchModel(modelName: string): Promise<boolean> {
    if (!this.initialized) {
      throw new Error('Claude API 未初始化')
    }

    if (!(modelName in CLAUDE_MODELS)) {
      throw new Error(`不支持的模型: ${modelName}`)
    }

    this.currentModel = modelName
    console.log(`Switched to model: ${this.currentModel}`)
    return true
  }

  async checkQuota(): Promise<QuotaInfo> {
    if (!this.apiKey) {
      return {
        isValid: false,
        model: this.currentModel,
        error: 'API Key 未配置'
      }
    }

    try {
      console.log(`[Claude] 检查配额，使用模型: ${this.currentModel}`)

      const response = await aiFetch(`${API_BASE}/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.apiKey,
          'anthropic-version': API_VERSION
        },
        body: JSON.stringify({
          model: this.currentModel,
          max_tokens: 10,
          messages: [{ role: 'user', content: 'Hi' }]
        })
      })

      console.log(`[Claude] 响应状态: ${response.status}`)

      if (response.ok) {
        return {
          isValid: true,
          model: this.currentModel,
          quotaExceeded: false
        }
      }

      const errorMsg = response.data?.error?.message || response.error || `HTTP ${response.status}`

      const isQuotaError = response.status === 429 ||
                           errorMsg.includes('rate limit') ||
                           errorMsg.includes('quota')

      return {
        isValid: false,
        model: this.currentModel,
        error: errorMsg,
        quotaExceeded: isQuotaError
      }
    } catch (error: any) {
      console.error(`[Claude] 配额检查异常:`, error)

      let errorMessage = error.message || String(error)
      if (errorMessage.includes('Failed to fetch') || errorMessage.includes('fetch')) {
        errorMessage = '网络连接失败。如果在中国大陆，请确保已启用代理并重启应用。'
      }

      return {
        isValid: false,
        model: this.currentModel,
        error: errorMessage
      }
    }
  }

  getAvailableModels(): Record<string, ModelInfo> {
    return CLAUDE_MODELS
  }

  getCurrentModel(): string {
    return this.currentModel
  }

  isReady(): boolean {
    return this.initialized && !!this.apiKey
  }
}

// 导出单例实例
export const claudeProvider = new ClaudeProvider()

// 导出模型配置
export { CLAUDE_MODELS }
