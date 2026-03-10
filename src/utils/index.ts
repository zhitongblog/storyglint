/**
 * 格式化字数显示
 */
export function formatWordCount(count: number): string {
  if (count < 1000) {
    return `${count}字`
  } else if (count < 10000) {
    return `${(count / 1000).toFixed(1)}千字`
  } else {
    return `${(count / 10000).toFixed(1)}万字`
  }
}

/**
 * 格式化日期
 */
export function formatDate(dateString: string): string {
  const date = new Date(dateString)
  const now = new Date()
  const diff = now.getTime() - date.getTime()

  const minutes = Math.floor(diff / 60000)
  const hours = Math.floor(diff / 3600000)
  const days = Math.floor(diff / 86400000)

  if (minutes < 1) {
    return '刚刚'
  } else if (minutes < 60) {
    return `${minutes}分钟前`
  } else if (hours < 24) {
    return `${hours}小时前`
  } else if (days < 7) {
    return `${days}天前`
  } else {
    return date.toLocaleDateString('zh-CN')
  }
}

/**
 * 生成 UUID
 */
export function generateId(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

/**
 * 防抖函数
 */
export function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: NodeJS.Timeout | null = null

  return function (this: any, ...args: Parameters<T>) {
    if (timeout) {
      clearTimeout(timeout)
    }
    timeout = setTimeout(() => {
      func.apply(this, args)
    }, wait)
  }
}

/**
 * 节流函数
 */
export function throttle<T extends (...args: any[]) => any>(
  func: T,
  limit: number
): (...args: Parameters<T>) => void {
  let inThrottle = false

  return function (this: any, ...args: Parameters<T>) {
    if (!inThrottle) {
      func.apply(this, args)
      inThrottle = true
      setTimeout(() => {
        inThrottle = false
      }, limit)
    }
  }
}

/**
 * 深拷贝对象
 */
export function deepClone<T>(obj: T): T {
  if (obj === null || typeof obj !== 'object') {
    return obj
  }

  if (Array.isArray(obj)) {
    return obj.map((item) => deepClone(item)) as unknown as T
  }

  const cloned = {} as T
  for (const key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      cloned[key] = deepClone(obj[key])
    }
  }

  return cloned
}

/**
 * 从 HTML 中提取纯文本
 */
export function htmlToText(html: string): string {
  const div = document.createElement('div')
  div.innerHTML = html
  return div.textContent || div.innerText || ''
}

/**
 * 计算阅读时间（分钟）
 */
export function calculateReadingTime(wordCount: number): number {
  // 假设平均阅读速度为每分钟 400 字
  return Math.ceil(wordCount / 400)
}

// 定义配置接口（与 services/ai/types.ts 保持一致）
interface ProviderConfigNew {
  apiKeys: string[]
  activeKeyIndex: number
  model: string
}

interface ProviderConfigLegacy {
  apiKey: string
  model: string
}

type ProviderConfigAny = ProviderConfigNew | ProviderConfigLegacy

function isNewFormat(config: ProviderConfigAny): config is ProviderConfigNew {
  return 'apiKeys' in config && Array.isArray(config.apiKeys)
}

/**
 * 获取当前配置的 AI API Key
 * 支持新的多密钥格式，向后兼容旧格式
 */
export async function getConfiguredApiKey(): Promise<string | null> {
  const provider = await window.electron.settings.get('aiProvider') as string | null
  const configs = await window.electron.settings.get('aiProviderConfigs') as Record<string, ProviderConfigAny> | null

  if (configs && provider && configs[provider]) {
    const config = configs[provider]
    // 新格式：多密钥
    if (isNewFormat(config)) {
      if (config.apiKeys.length > 0) {
        const activeIndex = config.activeKeyIndex || 0
        return config.apiKeys[activeIndex] || config.apiKeys[0]
      }
      return null
    }
    // 旧格式：单密钥
    return config.apiKey || null
  }
  // 向后兼容：尝试旧的 geminiApiKey
  const oldKey = await window.electron.settings.get('geminiApiKey') as string | null
  return oldKey || null
}

/**
 * 获取 Gemini API Key（用于封面生成等 Gemini 专属功能）
 * 无论当前选择哪个提供商，都返回 Gemini 的 API Key
 */
export async function getGeminiApiKey(): Promise<string | null> {
  const configs = await window.electron.settings.get('aiProviderConfigs') as Record<string, ProviderConfigAny> | null

  if (configs?.gemini) {
    const config = configs.gemini
    // 新格式：多密钥
    if (isNewFormat(config)) {
      if (config.apiKeys.length > 0) {
        const activeIndex = config.activeKeyIndex || 0
        return config.apiKeys[activeIndex] || config.apiKeys[0]
      }
      return null
    }
    // 旧格式：单密钥
    return config.apiKey || null
  }
  // 向后兼容：尝试旧的 geminiApiKey
  const oldKey = await window.electron.settings.get('geminiApiKey') as string | null
  return oldKey || null
}

/**
 * 获取当前 AI 提供商的完整配置
 * 返回提供商类型、API Key 和模型名称
 */
export async function getAIProviderConfig(): Promise<{
  provider: string
  apiKey: string
  model: string
} | null> {
  const provider = await window.electron.settings.get('aiProvider') as string | null
  const configs = await window.electron.settings.get('aiProviderConfigs') as Record<string, ProviderConfigAny> | null

  if (configs && provider && configs[provider]) {
    const config = configs[provider]
    let apiKey: string | null = null

    // 新格式：多密钥
    if (isNewFormat(config)) {
      if (config.apiKeys.length > 0) {
        const activeIndex = config.activeKeyIndex || 0
        apiKey = config.apiKeys[activeIndex] || config.apiKeys[0]
      }
    } else {
      // 旧格式：单密钥
      apiKey = config.apiKey || null
    }

    if (apiKey) {
      return {
        provider,
        apiKey,
        model: config.model || ''
      }
    }
  }

  // 向后兼容：尝试旧的 geminiApiKey
  const oldKey = await window.electron.settings.get('geminiApiKey') as string | null
  if (oldKey) {
    return {
      provider: 'gemini',
      apiKey: oldKey,
      model: ''
    }
  }

  return null
}
