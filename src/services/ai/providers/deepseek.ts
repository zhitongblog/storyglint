/**
 * DeepSeek AI Provider
 * 使用 OpenAI 兼容 API（通过 Electron IPC 代理请求）
 */

import type { AIProvider, ModelInfo, QuotaInfo, ProviderMeta } from '../types'
import { PROVIDER_INFO } from '../types'
import { aiFetch } from '../fetch-helper'

// DeepSeek 模型配置
const DEEPSEEK_MODELS: Record<string, ModelInfo> = {
  'deepseek-chat': {
    name: 'DeepSeek Chat',
    description: '通用对话模型，速度快，性价比高',
    contextWindow: 64000,
    recommended: true
  },
  'deepseek-reasoner': {
    name: 'DeepSeek Reasoner',
    description: '推理增强模型（R1），适合复杂逻辑任务',
    contextWindow: 64000,
    recommended: false
  }
}

const DEFAULT_MODEL = 'deepseek-chat'
const API_BASE = 'https://api.deepseek.com/v1'

export class DeepSeekProvider implements AIProvider {
  readonly type = 'deepseek' as const
  readonly meta: ProviderMeta = PROVIDER_INFO.deepseek

  private apiKey: string = ''
  private currentModel: string = DEFAULT_MODEL
  private initialized: boolean = false

  async init(apiKey: string, modelName?: string): Promise<boolean> {
    try {
      if (modelName && modelName in DEEPSEEK_MODELS) {
        this.currentModel = modelName
      }

      this.apiKey = apiKey
      this.initialized = true
      console.log(`✅ DeepSeek initialized with model: ${this.currentModel}`)
      return true
    } catch (error) {
      console.error('❌ Failed to initialize DeepSeek:', error)
      return false
    }
  }

  async generateText(
    prompt: string,
    retries: number = 2,
    _timeout: number = 60000
  ): Promise<string> {
    if (!this.initialized || !this.apiKey) {
      throw new Error('DeepSeek API 未初始化，请先在设置中配置 API Key')
    }

    let lastError: any = null

    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        console.log(`[DeepSeek API] 请求尝试 ${attempt + 1}/${retries + 1}`)

        const response = await aiFetch(`${API_BASE}/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.apiKey}`
          },
          body: JSON.stringify({
            model: this.currentModel,
            messages: [{ role: 'user', content: prompt }],
            temperature: 0.7
          })
        })

        if (!response.ok) {
          const errorMsg = response.data?.error?.message || response.error || `HTTP ${response.status}`
          throw new Error(errorMsg)
        }

        const text = response.data?.choices?.[0]?.message?.content || ''

        console.log(`[DeepSeek API] 请求成功`)
        return text

      } catch (error: any) {
        lastError = error
        const errorMsg = error.message || String(error)
        console.error(`[DeepSeek API] 请求失败 (尝试 ${attempt + 1}/${retries + 1}):`, errorMsg)

        if (attempt === retries) break

        if (errorMsg.includes('429') || errorMsg.includes('rate limit')) {
          throw new Error('⚠️ API 配额已用尽，请稍后重试')
        }

        if (errorMsg.includes('401') || errorMsg.includes('invalid')) {
          throw new Error('❌ API Key 无效，请检查全局设置')
        }

        const waitTime = Math.min(2000 * (attempt + 1), 5000)
        console.log(`[DeepSeek API] ${waitTime}ms 后重试...`)
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
      throw new Error('DeepSeek API 未初始化，请先在设置中配置 API Key')
    }

    const response = await fetch(`${API_BASE}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`
      },
      body: JSON.stringify({
        model: this.currentModel,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.7,
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
          if (data === '[DONE]') return
          try {
            const json = JSON.parse(data)
            const content = json.choices?.[0]?.delta?.content
            if (content) yield content
          } catch {
            // Skip invalid JSON
          }
        }
      }
    }
  }

  async switchModel(modelName: string): Promise<boolean> {
    if (!this.initialized) {
      throw new Error('DeepSeek API 未初始化')
    }

    if (!(modelName in DEEPSEEK_MODELS)) {
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
      console.log(`[DeepSeek] 检查配额，使用模型: ${this.currentModel}`)
      console.log(`[DeepSeek] API 端点: ${API_BASE}/chat/completions`)

      const response = await aiFetch(`${API_BASE}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`
        },
        body: JSON.stringify({
          model: this.currentModel,
          messages: [{ role: 'user', content: 'Hi' }],
          max_tokens: 5
        })
      })

      console.log(`[DeepSeek] 响应状态: ${response.status}`)

      if (response.ok) {
        return {
          isValid: true,
          model: this.currentModel,
          quotaExceeded: false
        }
      }

      const errorMsg = response.data?.error?.message || response.error || `HTTP ${response.status}`

      console.log(`[DeepSeek] 错误响应:`, response.data)

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
      console.error(`[DeepSeek] 配额检查异常:`, error)

      let errorMessage = error.message || String(error)
      if (errorMessage.includes('Failed to fetch') || errorMessage.includes('fetch')) {
        errorMessage = '网络连接失败。请检查网络连接是否正常。DeepSeek 是国内服务，不需要代理。'
      }

      return {
        isValid: false,
        model: this.currentModel,
        error: errorMessage
      }
    }
  }

  getAvailableModels(): Record<string, ModelInfo> {
    return DEEPSEEK_MODELS
  }

  getCurrentModel(): string {
    return this.currentModel
  }

  isReady(): boolean {
    return this.initialized && !!this.apiKey
  }
}

// 导出单例实例
export const deepseekProvider = new DeepSeekProvider()

// 导出模型配置
export { DEEPSEEK_MODELS }
