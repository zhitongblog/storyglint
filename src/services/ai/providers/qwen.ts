/**
 * Alibaba Qwen (通义千问) AI Provider
 * 使用阿里云 DashScope API（通过 Electron IPC 代理请求）
 */

import type { AIProvider, ModelInfo, QuotaInfo, ProviderMeta } from '../types'
import { PROVIDER_INFO } from '../types'
import { aiFetch } from '../fetch-helper'

// Qwen 模型配置
const QWEN_MODELS: Record<string, ModelInfo> = {
  'qwen-max': {
    name: 'Qwen Max',
    description: '最强推理能力，适合复杂任务',
    contextWindow: 32000,
    recommended: true
  },
  'qwen-plus': {
    name: 'Qwen Plus',
    description: '性能与成本平衡，日常使用推荐',
    contextWindow: 131072,
    recommended: false
  },
  'qwen-turbo': {
    name: 'Qwen Turbo',
    description: '速度最快，成本最低',
    contextWindow: 131072,
    recommended: false
  },
  'qwen-long': {
    name: 'Qwen Long',
    description: '超长上下文，适合长文本处理',
    contextWindow: 10000000,
    recommended: false
  }
}

const DEFAULT_MODEL = 'qwen-max'
const API_BASE = 'https://dashscope.aliyuncs.com/compatible-mode/v1'

export class QwenProvider implements AIProvider {
  readonly type = 'qwen' as const
  readonly meta: ProviderMeta = PROVIDER_INFO.qwen

  private apiKey: string = ''
  private currentModel: string = DEFAULT_MODEL
  private initialized: boolean = false

  async init(apiKey: string, modelName?: string): Promise<boolean> {
    try {
      if (modelName && modelName in QWEN_MODELS) {
        this.currentModel = modelName
      }

      this.apiKey = apiKey
      this.initialized = true
      console.log(`✅ Qwen initialized with model: ${this.currentModel}`)
      return true
    } catch (error) {
      console.error('❌ Failed to initialize Qwen:', error)
      return false
    }
  }

  async generateText(
    prompt: string,
    retries: number = 2,
    _timeout: number = 60000
  ): Promise<string> {
    if (!this.initialized || !this.apiKey) {
      throw new Error('通义千问 API 未初始化，请先在设置中配置 API Key')
    }

    let lastError: any = null

    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        console.log(`[Qwen API] 请求尝试 ${attempt + 1}/${retries + 1}`)

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
          const errorMsg = response.data?.error?.message || response.data?.message || response.error || `HTTP ${response.status}`
          throw new Error(errorMsg)
        }

        const text = response.data?.choices?.[0]?.message?.content || ''

        console.log(`[Qwen API] 请求成功`)
        return text

      } catch (error: any) {
        lastError = error
        const errorMsg = error.message || String(error)
        console.error(`[Qwen API] 请求失败 (尝试 ${attempt + 1}/${retries + 1}):`, errorMsg)

        if (attempt === retries) break

        if (errorMsg.includes('429') || errorMsg.includes('rate limit') || errorMsg.includes('Throttling')) {
          throw new Error('⚠️ API 配额已用尽，请稍后重试')
        }

        if (errorMsg.includes('401') || errorMsg.includes('InvalidApiKey') || errorMsg.includes('invalid')) {
          throw new Error('❌ API Key 无效，请检查全局设置')
        }

        const waitTime = Math.min(2000 * (attempt + 1), 5000)
        console.log(`[Qwen API] ${waitTime}ms 后重试...`)
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
      throw new Error('通义千问 API 未初始化，请先在设置中配置 API Key')
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
      throw new Error(errorData.error?.message || errorData.message || `HTTP ${response.status}`)
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
      throw new Error('通义千问 API 未初始化')
    }

    if (!(modelName in QWEN_MODELS)) {
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
      console.log(`[Qwen] 检查配额，使用模型: ${this.currentModel}`)

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

      console.log(`[Qwen] 响应状态: ${response.status}`)

      if (response.ok) {
        return {
          isValid: true,
          model: this.currentModel,
          quotaExceeded: false
        }
      }

      const errorMsg = response.data?.error?.message || response.data?.message || response.error || `HTTP ${response.status}`

      const isQuotaError = response.status === 429 ||
                           errorMsg.includes('rate limit') ||
                           errorMsg.includes('quota') ||
                           errorMsg.includes('Throttling')

      return {
        isValid: false,
        model: this.currentModel,
        error: errorMsg,
        quotaExceeded: isQuotaError
      }
    } catch (error: any) {
      console.error(`[Qwen] 配额检查异常:`, error)

      let errorMessage = error.message || String(error)
      if (errorMessage.includes('Failed to fetch') || errorMessage.includes('fetch')) {
        errorMessage = '网络连接失败。请检查网络连接是否正常。'
      }

      return {
        isValid: false,
        model: this.currentModel,
        error: errorMessage
      }
    }
  }

  getAvailableModels(): Record<string, ModelInfo> {
    return QWEN_MODELS
  }

  getCurrentModel(): string {
    return this.currentModel
  }

  isReady(): boolean {
    return this.initialized && !!this.apiKey
  }
}

// 导出单例实例
export const qwenProvider = new QwenProvider()

// 导出模型配置
export { QWEN_MODELS }
