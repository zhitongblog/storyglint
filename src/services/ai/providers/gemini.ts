/**
 * Google Gemini AI Provider
 * 基于 @google/generative-ai SDK
 */

import { GoogleGenerativeAI, GenerativeModel } from '@google/generative-ai'
import type { AIProvider, ModelInfo, QuotaInfo, ProviderMeta } from '../types'
import { PROVIDER_INFO } from '../types'
import type { Character } from '../../../types'

// Gemini 模型配置
const GEMINI_MODELS: Record<string, ModelInfo> = {
  'gemini-3-flash-preview': {
    name: 'Gemini 3 Flash (预览版)',
    description: '速度快3倍，配额更高，编程能力更强，Google推荐首选',
    contextWindow: 2097152,
    recommended: true
  },
  'gemini-3-pro-preview': {
    name: 'Gemini 3 Pro (预览版)',
    description: '最大推理深度，但速度较慢且配额限制更严格',
    contextWindow: 2097152,
    recommended: false
  },
  'gemini-2.0-flash-exp': {
    name: 'Gemini 2.0 Flash (实验版)',
    description: '快速模型，适合大纲生成',
    contextWindow: 1048576,
    recommended: false
  },
  'gemini-1.5-pro': {
    name: 'Gemini 1.5 Pro',
    description: '稳定版，高质量输出',
    contextWindow: 2097152,
    recommended: false
  },
  'gemini-1.5-flash': {
    name: 'Gemini 1.5 Flash',
    description: '快速版，性价比高',
    contextWindow: 1048576,
    recommended: false
  }
}

const DEFAULT_MODEL = 'gemini-3-flash-preview'

export class GeminiProvider implements AIProvider {
  readonly type = 'gemini' as const
  readonly meta: ProviderMeta = PROVIDER_INFO.gemini

  private genAI: GoogleGenerativeAI | null = null
  private model: GenerativeModel | null = null
  private apiKey: string = ''
  private currentModel: string = DEFAULT_MODEL

  async init(apiKey: string, modelName?: string): Promise<boolean> {
    try {
      if (modelName && modelName in GEMINI_MODELS) {
        this.currentModel = modelName
      }

      this.genAI = new GoogleGenerativeAI(apiKey)
      this.model = this.genAI.getGenerativeModel({ model: this.currentModel })
      this.apiKey = apiKey
      console.log(`✅ Gemini initialized with model: ${this.currentModel}`)
      return true
    } catch (error) {
      console.error('❌ Failed to initialize Gemini:', error)
      return false
    }
  }

  async generateText(
    prompt: string,
    retries: number = 2,
    timeout: number = 60000
  ): Promise<string> {
    if (!this.model) {
      throw new Error('Gemini API 未初始化，请先在设置中配置 API Key')
    }

    let lastError: any = null

    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        console.log(`[Gemini API] 请求尝试 ${attempt + 1}/${retries + 1}`)

        const timeoutPromise = new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error('请求超时，请检查网络连接')), timeout)
        })

        const apiPromise = (async () => {
          const result = await this.model!.generateContent(prompt)
          const response = await result.response
          return response.text()
        })()

        const text = await Promise.race([apiPromise, timeoutPromise])
        console.log(`[Gemini API] 请求成功`)
        return text

      } catch (error: any) {
        lastError = error
        const errorMsg = error.message || String(error)
        console.error(`[Gemini API] 请求失败 (尝试 ${attempt + 1}/${retries + 1}):`, errorMsg)

        if (attempt === retries) break

        if (errorMsg.includes('429') || errorMsg.includes('quota')) {
          throw new Error('⚠️ API 配额已用尽，请稍后重试或更换模型')
        }

        if (errorMsg.includes('401') || errorMsg.includes('invalid')) {
          throw new Error('❌ API Key 无效，请检查全局设置')
        }

        const waitTime = Math.min(2000 * (attempt + 1), 5000)
        console.log(`[Gemini API] ${waitTime}ms 后重试...`)
        await new Promise(resolve => setTimeout(resolve, waitTime))
      }
    }

    const errorMsg = lastError?.message || String(lastError)
    if (errorMsg.includes('fetch') || errorMsg.includes('Failed to fetch') || errorMsg.includes('network')) {
      throw new Error('🌐 网络连接失败，请检查：\n1. 如果在中国大陆，请在"全局设置"中启用代理\n2. 确认代理配置正确（需要重启应用生效）\n3. 或者切换到国内AI服务（DeepSeek/通义千问/Kimi）')
    }

    throw new Error(`生成失败: ${errorMsg}`)
  }

  async *generateTextStream(prompt: string): AsyncGenerator<string, void, unknown> {
    if (!this.model) {
      throw new Error('Gemini API 未初始化，请先在设置中配置 API Key')
    }

    const result = await this.model.generateContentStream(prompt)

    for await (const chunk of result.stream) {
      const text = chunk.text()
      if (text) {
        yield text
      }
    }
  }

  async switchModel(modelName: string): Promise<boolean> {
    if (!this.genAI || !this.apiKey) {
      throw new Error('Gemini API 未初始化')
    }

    if (!(modelName in GEMINI_MODELS)) {
      throw new Error(`不支持的模型: ${modelName}`)
    }

    try {
      this.currentModel = modelName
      this.model = this.genAI.getGenerativeModel({ model: this.currentModel })
      console.log(`Switched to model: ${this.currentModel}`)
      return true
    } catch (error) {
      console.error('Failed to switch model:', error)
      return false
    }
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
      const testModel = this.genAI?.getGenerativeModel({ model: this.currentModel })
      if (!testModel) {
        return {
          isValid: false,
          model: this.currentModel,
          error: '模型初始化失败'
        }
      }

      const result = await testModel.generateContent('Hi')
      await result.response

      return {
        isValid: true,
        model: this.currentModel,
        quotaExceeded: false
      }
    } catch (error: any) {
      console.error('Quota check error:', error)

      const errorMessage = error.message || String(error)
      const isQuotaError = errorMessage.includes('429') ||
                           errorMessage.includes('quota') ||
                           errorMessage.includes('rate limit')

      let parsedError = errorMessage
      if (errorMessage.includes('429')) {
        parsedError = '⚠️ 配额已用尽或达到速率限制'
      } else if (errorMessage.includes('invalid') || errorMessage.includes('401')) {
        parsedError = '❌ API Key 无效或已过期'
      } else if (errorMessage.includes('403')) {
        parsedError = '🚫 API Key 无权限访问该模型'
      }

      return {
        isValid: !isQuotaError,
        model: this.currentModel,
        error: parsedError,
        quotaExceeded: isQuotaError
      }
    }
  }

  getAvailableModels(): Record<string, ModelInfo> {
    return GEMINI_MODELS
  }

  getCurrentModel(): string {
    return this.currentModel
  }

  isReady(): boolean {
    return this.model !== null
  }

  // Gemini 特有方法：查找可用模型
  async findAvailableModel(): Promise<{
    availableModel: string | null
    results: Record<string, { available: boolean; error?: string }>
  }> {
    if (!this.apiKey || !this.genAI) {
      throw new Error('Gemini API 未初始化')
    }

    const results: Record<string, { available: boolean; error?: string }> = {}
    let availableModel: string | null = null

    for (const modelName of Object.keys(GEMINI_MODELS)) {
      try {
        console.log(`Testing model: ${modelName}`)
        const testModel = this.genAI.getGenerativeModel({ model: modelName })
        const result = await testModel.generateContent('Test')
        await result.response

        results[modelName] = { available: true }
        if (!availableModel) {
          availableModel = modelName
        }
        console.log(`✅ ${modelName} is available`)
      } catch (error: any) {
        const errorMsg = error.message || String(error)
        results[modelName] = {
          available: false,
          error: errorMsg.slice(0, 100)
        }
        console.log(`❌ ${modelName} failed: ${errorMsg.slice(0, 100)}`)
      }
    }

    return { availableModel, results }
  }

  // Gemini 特有方法：生成封面图片
  async generateCoverImage(
    bookTitle: string,
    _authorName: string,
    style: string,
    genres: string[],
    characters?: Character[]
  ): Promise<string> {
    if (!this.genAI || !this.apiKey) {
      throw new Error('Gemini API 未初始化，请先在设置中配置 API Key')
    }

    const IMAGE_MODEL = 'gemini-3-pro-image-preview'

    // 扩展的风格描述
    const styleDescriptions: Record<string, string> = {
      // 东方风格
      wuxia: 'Chinese wuxia martial arts style, flowing robes, sword aura, misty mountains backdrop, ink wash painting elements',
      xuanhuan: 'Eastern fantasy cultivation style, glowing spiritual energy, floating immortal palaces, mystical clouds, Chinese mythological elements',
      xianxia: 'Chinese immortal cultivation style, celestial atmosphere, ethereal lighting, floating islands, Taoist elements',
      ancient: 'Ancient Chinese palace style, elegant hanfu costumes, golden and red colors, imperial architecture',
      ink: 'Traditional Chinese ink wash painting style, monochrome with subtle colors, calligraphic brushstrokes, poetic atmosphere',
      // 西方风格
      fantasy: 'epic Western fantasy style, magical glowing elements, mystical purple and blue atmosphere, medieval fantasy setting',
      medieval: 'medieval European style, knights and castles, warm candlelight, heraldry elements, stone architecture',
      gothic: 'dark gothic style, cathedral architecture, dramatic shadows, deep red and black, mysterious atmosphere',
      steampunk: 'steampunk Victorian style, brass gears and machinery, warm amber tones, industrial elegance',
      // 现代风格
      modern: 'modern urban style, contemporary fashion, city skyline, clean design, warm sunset colors',
      scifi: 'sci-fi futuristic style, sleek technology, holographic displays, blue and silver metallic',
      cyberpunk: 'cyberpunk neon style, rain-slicked streets, neon signs, pink and cyan colors, high contrast',
      mecha: 'mecha anime style, giant robots, dramatic poses, metallic textures, explosive action',
      // 情感风格
      romance: 'romantic dreamy style, soft pink and gold colors, flower petals, bokeh lights, emotional atmosphere',
      youth: 'youth campus style, school uniforms, cherry blossoms, bright colors, nostalgic feeling',
      warm: 'warm healing style, cozy atmosphere, soft lighting, pastel colors, heartwarming scene',
      // 其他风格
      horror: 'dark horror style, deep shadows, blood red accents, fog, unsettling atmosphere',
      mystery: 'mystery thriller style, dramatic lighting, shadows, noir elements, suspenseful mood',
      apocalypse: 'post-apocalyptic style, ruined cityscape, dusty atmosphere, survival elements, dramatic sky',
      anime: 'anime manga style, dynamic composition, bold colors, clean lines, expressive characters',
      realistic: 'realistic oil painting style, detailed textures, classical composition, rich colors',
      comic: 'comic book illustration style, bold outlines, vibrant colors, dynamic action poses'
    }

    const styleDesc = styleDescriptions[style] || styleDescriptions.xuanhuan
    const genreDesc = genres.slice(0, 2).join(' ') || 'fantasy'

    // 构建角色描述
    let characterDesc = ''
    if (characters && characters.length > 0) {
      const charDescriptions = characters.map(char => {
        const role = char.role === 'protagonist' ? 'main character' : char.role === 'antagonist' ? 'villain' : 'supporting character'
        // 从角色设定中提取外貌描述
        const appearance = char.description?.slice(0, 150) || ''
        return `${role} "${char.name}": ${appearance}`
      }).join('; ')

      characterDesc = `, featuring characters: ${charDescriptions}`
    }

    // 根据是否有角色调整构图
    const composition = characters && characters.length > 0
      ? 'character-focused composition with figures prominently displayed'
      : 'atmospheric landscape composition'

    const prompt = `Create a stunning book cover illustration: ${styleDesc}, book title theme "${bookTitle}", genre ${genreDesc}${characterDesc}. ${composition}, professional quality, vertical portrait orientation (3:4 ratio), cinematic dramatic lighting, ultra detailed, masterpiece quality. IMPORTANT: Do not include any text, letters, words, or watermarks in the image.`

    const errors: string[] = []

    try {
      console.log(`Using image model: ${IMAGE_MODEL}`)
      const imageModel = this.genAI.getGenerativeModel({
        model: IMAGE_MODEL,
        generationConfig: {
          responseModalities: ['IMAGE', 'TEXT'],
        } as any,
      })

      const result = await imageModel.generateContent(prompt)
      const response = result.response
      const parts = response.candidates?.[0]?.content?.parts || []

      for (const part of parts) {
        const p = part as any
        if (p.inlineData?.data) {
          console.log('Image generated successfully')
          return `data:${p.inlineData.mimeType};base64,${p.inlineData.data}`
        }
      }
      errors.push('SDK: 无图像返回')
    } catch (e: any) {
      console.error('SDK method error:', e)
      errors.push(`SDK: ${e.message}`)
    }

    // Fallback: Direct REST API call
    try {
      console.log('Fallback: Direct REST API call')
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${IMAGE_MODEL}:generateContent?key=${this.apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: {
              responseModalities: ['IMAGE', 'TEXT']
            }
          })
        }
      )

      const responseText = await response.text()
      console.log('REST API response status:', response.status)

      if (response.ok) {
        const data = JSON.parse(responseText)
        const parts = data.candidates?.[0]?.content?.parts || []

        for (const part of parts) {
          if (part.inlineData?.data) {
            console.log('Image generated via REST API')
            return `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`
          }
        }
        errors.push('REST: 无图像返回')
      } else {
        errors.push(`REST: ${response.status}`)
      }
    } catch (e: any) {
      console.error('REST API error:', e)
      errors.push(`REST: ${e.message}`)
    }

    console.error('Image generation failed:', errors)
    throw new Error(`封面生成失败: ${errors.join('; ')}`)
  }
}

// 导出单例实例
export const geminiProvider = new GeminiProvider()

// 导出模型配置
export { GEMINI_MODELS }
