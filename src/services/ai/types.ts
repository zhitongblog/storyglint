/**
 * AI Provider Types and Interfaces
 * 多 AI 模型提供商支持的类型定义
 */

// 支持的提供商类型
export type ProviderType = 'gemini' | 'openai' | 'claude' | 'deepseek' | 'qwen' | 'kimi'

// 模型信息
export interface ModelInfo {
  name: string
  description: string
  contextWindow: number
  recommended?: boolean
}

// 配额检查结果
export interface QuotaInfo {
  isValid: boolean
  model: string
  error?: string
  quotaExceeded?: boolean
  rateLimitInfo?: {
    requestsPerMinute?: number
    tokensPerMinute?: number
    requestsPerDay?: number
  }
}

// 提供商元信息
export interface ProviderMeta {
  name: string
  region: 'global' | 'china'
  website: string
  apiKeyUrl: string
  description: string
}

// AI 提供商接口
export interface AIProvider {
  // 提供商类型标识
  readonly type: ProviderType

  // 提供商元信息
  readonly meta: ProviderMeta

  // 初始化 API
  init(apiKey: string, modelName?: string): Promise<boolean>

  // 生成文本内容（带超时和重试）
  generateText(prompt: string, retries?: number, timeout?: number): Promise<string>

  // 流式生成文本
  generateTextStream(prompt: string): AsyncGenerator<string, void, unknown>

  // 切换模型
  switchModel(modelName: string): Promise<boolean>

  // 检查配额
  checkQuota(): Promise<QuotaInfo>

  // 获取可用模型列表
  getAvailableModels(): Record<string, ModelInfo>

  // 获取当前模型
  getCurrentModel(): string

  // 检查是否已初始化
  isReady(): boolean
}

// 提供商配置
export interface ProviderConfig {
  apiKey: string
  model: string
}

// 所有提供商配置
export interface AIProviderConfigs {
  [provider: string]: ProviderConfig
}

// 提供商信息常量
export const PROVIDER_INFO: Record<ProviderType, ProviderMeta> = {
  gemini: {
    name: 'Google Gemini',
    region: 'global',
    website: 'https://ai.google.dev',
    apiKeyUrl: 'https://aistudio.google.com/app/apikey',
    description: 'Google 的 Gemini 系列模型，支持多模态，上下文窗口大'
  },
  openai: {
    name: 'OpenAI GPT',
    region: 'global',
    website: 'https://openai.com',
    apiKeyUrl: 'https://platform.openai.com/api-keys',
    description: 'OpenAI 的 GPT 系列模型，业界标杆'
  },
  claude: {
    name: 'Anthropic Claude',
    region: 'global',
    website: 'https://anthropic.com',
    apiKeyUrl: 'https://console.anthropic.com/settings/keys',
    description: 'Anthropic 的 Claude 系列模型，擅长长文本和复杂推理'
  },
  deepseek: {
    name: 'DeepSeek',
    region: 'china',
    website: 'https://deepseek.com',
    apiKeyUrl: 'https://platform.deepseek.com/api_keys',
    description: 'DeepSeek 深度求索，国产大模型，推理能力强'
  },
  qwen: {
    name: '阿里通义千问',
    region: 'china',
    website: 'https://tongyi.aliyun.com',
    apiKeyUrl: 'https://dashscope.console.aliyun.com/apiKey',
    description: '阿里云通义千问，国产大模型，中文理解能力优秀'
  },
  kimi: {
    name: 'Moonshot Kimi',
    region: 'china',
    website: 'https://kimi.moonshot.cn',
    apiKeyUrl: 'https://platform.moonshot.cn/console/api-keys',
    description: 'Moonshot Kimi，国产大模型，支持超长上下文'
  }
}

// 按区域分组的提供商
export const PROVIDERS_BY_REGION = {
  global: ['gemini', 'openai', 'claude'] as ProviderType[],
  china: ['deepseek', 'qwen', 'kimi'] as ProviderType[]
}
