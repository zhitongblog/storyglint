/**
 * AI Service Manager
 * 统一管理所有 AI 提供商，提供统一的接口
 */

import type { AIProvider, ProviderType, QuotaInfo, ModelInfo, ProviderConfig } from './types'
import { PROVIDER_INFO, PROVIDERS_BY_REGION } from './types'
import { geminiProvider, GeminiProvider, GEMINI_MODELS } from './providers/gemini'
import { openaiProvider, OPENAI_MODELS } from './providers/openai'
import { claudeProvider, CLAUDE_MODELS } from './providers/claude'
import { deepseekProvider, DEEPSEEK_MODELS } from './providers/deepseek'
import { qwenProvider, QWEN_MODELS } from './providers/qwen'
import { kimiProvider, KIMI_MODELS } from './providers/kimi'

// 所有提供商实例
const providers: Record<ProviderType, AIProvider> = {
  gemini: geminiProvider,
  openai: openaiProvider,
  claude: claudeProvider,
  deepseek: deepseekProvider,
  qwen: qwenProvider,
  kimi: kimiProvider
}

// 当前活跃的提供商
let currentProviderType: ProviderType = 'gemini'
let currentProvider: AIProvider = providers.gemini

/**
 * 获取当前提供商类型
 */
export function getCurrentProviderType(): ProviderType {
  return currentProviderType
}

/**
 * 获取当前提供商实例
 */
export function getCurrentProvider(): AIProvider {
  return currentProvider
}

/**
 * 获取所有提供商信息
 */
export function getProviders() {
  return PROVIDER_INFO
}

/**
 * 按区域获取提供商列表
 */
export function getProvidersByRegion(region: 'global' | 'china'): ProviderType[] {
  return PROVIDERS_BY_REGION[region]
}

/**
 * 获取指定提供商的实例
 */
export function getProvider(type: ProviderType): AIProvider {
  return providers[type]
}

/**
 * 切换提供商
 */
export function setProvider(type: ProviderType): void {
  if (!(type in providers)) {
    throw new Error(`不支持的提供商: ${type}`)
  }
  currentProviderType = type
  currentProvider = providers[type]
  console.log(`🔄 切换到 AI 提供商: ${PROVIDER_INFO[type].name}`)
}

/**
 * 初始化 AI（统一接口，保持向后兼容）
 */
export async function initAI(apiKey: string, modelName?: string): Promise<boolean> {
  return currentProvider.init(apiKey, modelName)
}

/**
 * 检查 AI 是否就绪
 */
export function isAIReady(): boolean {
  return currentProvider.isReady()
}

/**
 * 生成文本
 */
export async function generateText(
  prompt: string,
  retries?: number,
  timeout?: number
): Promise<string> {
  return currentProvider.generateText(prompt, retries, timeout)
}

/**
 * 流式生成文本
 */
export function generateTextStream(
  prompt: string
): AsyncGenerator<string, void, unknown> {
  return currentProvider.generateTextStream(prompt)
}

/**
 * 切换模型
 */
export async function switchModel(modelName: string): Promise<boolean> {
  return currentProvider.switchModel(modelName)
}

/**
 * 检查配额
 */
export async function checkQuota(): Promise<QuotaInfo> {
  return currentProvider.checkQuota()
}

/**
 * 获取可用模型
 */
export function getAvailableModels(): Record<string, ModelInfo> {
  return currentProvider.getAvailableModels()
}

/**
 * 获取当前模型名称
 */
export function getCurrentModelName(): string {
  return currentProvider.getCurrentModel()
}

/**
 * 获取所有提供商的模型配置
 */
export function getAllModels(): Record<ProviderType, Record<string, ModelInfo>> {
  return {
    gemini: GEMINI_MODELS,
    openai: OPENAI_MODELS,
    claude: CLAUDE_MODELS,
    deepseek: DEEPSEEK_MODELS,
    qwen: QWEN_MODELS,
    kimi: KIMI_MODELS
  }
}

// ===== Gemini 特有功能 =====

/**
 * 查找可用的 Gemini 模型
 */
export async function findAvailableModel() {
  const gemini = providers.gemini as GeminiProvider
  return gemini.findAvailableModel()
}

/**
 * 生成封面图片（仅 Gemini 支持）
 */
export async function generateCoverImage(
  bookTitle: string,
  authorName: string,
  style: string,
  genres: string[]
): Promise<string> {
  const gemini = providers.gemini as GeminiProvider
  return gemini.generateCoverImage(bookTitle, authorName, style, genres)
}

// ===== 高级功能（在 AI 管理器层面实现） =====

/**
 * 生成大纲
 */
export async function generateOutline(
  inspiration: string,
  constraints: string,
  scale: string,
  genres: string[],
  styles: string[]
): Promise<string> {
  const scaleMap: Record<string, string> = {
    micro: '1-3万字的微小说',
    short: '3-10万字的短篇小说',
    million: '100万字左右的长篇小说',
    three_million: '300万字以上的巨著'
  }

  const prompt = `你是一个顶级的网文主编兼金牌编剧，精通番茄、起点等平台的市场风向。

请根据以下信息，生成一个完整的小说大纲：

【核心灵感】
${inspiration}

【额外约束】
${constraints || '无'}

【创作规模】
${scaleMap[scale] || '百万字长篇'}

【题材】
${genres.join('、') || '未指定'}

【风格】
${styles.join('、') || '未指定'}

请生成以下内容：

## 一、作品概要
- 书名建议（3个备选）
- 一句话卖点
- 核心冲突
- 爽点循环设计

## 二、黄金三章设定
- 第一章：如何开篇吸引读者
- 第二章：如何深化矛盾
- 第三章：如何设置钩子

## 三、力量体系/金手指
- 详细的能力设定
- 成长路线图

## 四、50章细纲
按照"第X章 章节名：简要剧情"的格式列出前50章的大纲。

注意：
1. 必须包含明确的"爽点循环"设计
2. 每章结尾必须有悬念
3. 避免降智打脸、无脑送人头等网文毒点
4. 采用"现代轻快、画面感强"的网文风格`

  return generateText(prompt)
}

/**
 * 生成角色设定
 */
export async function generateCharacter(
  name: string,
  role: string,
  context: string
): Promise<string> {
  const prompt = `你是一个专业的角色设计师。

请根据以下信息，生成详细的角色设定：

【角色名称】${name}
【角色类型】${role === 'protagonist' ? '主角' : role === 'antagonist' ? '反派' : '配角'}
【故事背景】
${context}

请生成以下内容：

## 外貌特征
详细描述角色的外貌，包括身高、体型、发色、瞳色、穿着风格等

## 性格特点
列出3-5个核心性格特征，并解释其成因

## 内在欲望
角色最深层的渴望是什么？

## 核心弱点
角色的致命缺陷是什么？这个弱点如何影响剧情？

## 人物弧光
角色从故事开始到结束会经历怎样的成长变化？

## 标志性口头禅
设计1-2句有特色的口头禅

## 不可告人的秘密
这个角色隐藏着什么秘密？

注意：拒绝脸谱化，角色必须立体、真实、有矛盾感。`

  return generateText(prompt)
}

/**
 * 生成正文内容
 */
export async function generateContent(
  outline: string,
  previousContent: string,
  style: string
): Promise<string> {
  const prompt = `你是一个专业的网文作家。

请根据以下大纲和前文，续写2000-3000字的正文：

【本章大纲】
${outline}

【前文回顾】
${previousContent || '这是故事的开始'}

【写作风格】
${style || '现代轻快、画面感强'}

写作要求：
1. 坚持"Show, don't tell"原则，通过动作和反应表现情绪
2. 章节结尾必须留有悬念（断章艺术）
3. 字数控制在2000-3000字
4. 避免降智打脸、无脑送人头等网文毒点
5. 保持节奏紧凑，避免大段心理描写

请直接输出正文内容，不要包含任何解释或元信息。`

  return generateText(prompt)
}

/**
 * 润色内容
 */
export async function polishContent(content: string): Promise<string> {
  const prompt = `你是一个专业的文字编辑。

请润色以下内容，优化词藻、增强节奏感、检查逻辑漏洞：

【原文】
${content}

润色要求：
1. 保持原意不变
2. 优化用词，使表达更加精准生动
3. 调整句式，增强节奏感和可读性
4. 检查并修复逻辑漏洞
5. 保持网文风格的轻快感

请直接输出润色后的内容，不要包含任何解释。`

  return generateText(prompt)
}

/**
 * 生成故事摘要
 */
export async function generateSummary(content: string): Promise<string> {
  const prompt = `请为以下小说内容生成一个简洁的故事摘要（200字以内）：

${content}

要求：
1. 概括主要剧情走向
2. 突出核心冲突
3. 不剧透关键转折
4. 语言简洁有力`

  return generateText(prompt)
}

/**
 * AI 续写
 */
export async function continueWriting(
  currentContent: string,
  wordCount: number = 500
): Promise<string> {
  const prompt = `请基于以下内容，自然地续写约${wordCount}字：

${currentContent}

要求：
1. 保持风格一致
2. 情节自然衔接
3. 推动剧情发展
4. 如果到了合适的位置可以设置小悬念

请直接输出续写内容，不要包含任何解释。`

  return generateText(prompt)
}

/**
 * 分析章节角色死亡
 */
export async function analyzeChapterForDeaths(
  chapterTitle: string,
  chapterContent: string,
  characterNames: string[]
): Promise<{
  deaths: { name: string; description: string }[]
  confidence: 'high' | 'medium' | 'low'
}> {
  if (characterNames.length === 0 || !chapterContent) {
    return { deaths: [], confidence: 'low' }
  }

  const names = characterNames.join('、')
  const content = chapterContent.slice(0, 4000)

  const prompt = `分析以下章节，检测是否有角色死亡。

章节：${chapterTitle}
已知角色：${names}
内容：${content}

只检测明确的死亡事件，不包括：
- 假死、诈死
- 回忆中的死亡
- 可能的危险但未确认死亡

返回JSON：{"deaths":[{"name":"角色名","description":"死亡方式简述"}],"confidence":"high/medium/low"}
如果没有死亡事件，返回：{"deaths":[],"confidence":"low"}`

  try {
    const text = await generateText(prompt)
    let jsonStr = text.trim()
    const match = jsonStr.match(/\{[\s\S]*\}/)
    if (match) jsonStr = match[0]
    const data = JSON.parse(jsonStr)
    return {
      deaths: data.deaths || [],
      confidence: data.confidence || 'low'
    }
  } catch {
    return { deaths: [], confidence: 'low' }
  }
}

/**
 * 分析章节角色信息
 */
export async function analyzeChapterForCharacters(
  chapterTitle: string,
  chapterContent: string,
  characterNames: string[]
): Promise<{
  appearances: string[]
  deaths: string[]
  relationships: { char1: string; char2: string; relation: string }[]
}> {
  const names = characterNames.join('、')
  const content = chapterContent.slice(0, 3000)

  const prompt = `分析章节，找出角色信息。
章节：${chapterTitle}
已知角色：${names}
内容：${content}

返回JSON：{"appearances":["出场角色名"],"deaths":["死亡角色名"],"relationships":[{"char1":"角色1","char2":"角色2","relation":"关系"}]}`

  try {
    const text = await generateText(prompt)
    let jsonStr = text.trim()
    const match = jsonStr.match(/\{[\s\S]*\}/)
    if (match) jsonStr = match[0]
    const data = JSON.parse(jsonStr)
    return {
      appearances: data.appearances || [],
      deaths: data.deaths || [],
      relationships: data.relationships || []
    }
  } catch {
    return { appearances: [], deaths: [], relationships: [] }
  }
}

/**
 * 批量分析所有章节
 */
export async function analyzeAllChaptersForArchive(
  chapters: { title: string; content: string }[],
  characterNames: string[],
  onProgress?: (current: number, total: number) => void
): Promise<{
  characterUpdates: {
    name: string
    appearances: string[]
    isDead: boolean
    deathChapter: string
    relationships: { targetName: string; relation: string }[]
  }[]
}> {
  const characterMap: Record<string, {
    appearances: string[]
    isDead: boolean
    deathChapter: string
    relationships: Map<string, string>
  }> = {}

  for (const name of characterNames) {
    characterMap[name] = {
      appearances: [],
      isDead: false,
      deathChapter: '',
      relationships: new Map()
    }
  }

  for (let i = 0; i < chapters.length; i++) {
    const chapter = chapters[i]
    if (!chapter.content) continue

    onProgress?.(i + 1, chapters.length)

    const result = await analyzeChapterForCharacters(
      chapter.title,
      chapter.content,
      characterNames
    )

    for (const name of result.appearances) {
      if (characterMap[name]) {
        if (!characterMap[name].appearances.includes(chapter.title)) {
          characterMap[name].appearances.push(chapter.title)
        }
      }
    }

    for (const name of result.deaths) {
      if (characterMap[name] && !characterMap[name].isDead) {
        characterMap[name].isDead = true
        characterMap[name].deathChapter = chapter.title
      }
    }

    for (const rel of result.relationships) {
      if (characterMap[rel.char1]) {
        characterMap[rel.char1].relationships.set(rel.char2, rel.relation)
      }
      if (characterMap[rel.char2]) {
        characterMap[rel.char2].relationships.set(rel.char1, rel.relation)
      }
    }
  }

  const characterUpdates = Object.entries(characterMap).map(([name, data]) => ({
    name,
    appearances: data.appearances,
    isDead: data.isDead,
    deathChapter: data.deathChapter,
    relationships: Array.from(data.relationships.entries()).map(([targetName, relation]) => ({
      targetName,
      relation
    }))
  }))

  return { characterUpdates }
}

/**
 * 生成书名建议
 */
export async function generateBookTitle(
  inspiration: string,
  genres: string[],
  count: number = 5
): Promise<string[]> {
  const prompt = `你是一个资深的网文编辑，精通起点、番茄等平台的书名策划。

请根据以下灵感，生成${count}个有吸引力的书名。

【核心灵感】
${inspiration}

【题材标签】
${genres.join('、') || '未指定'}

要求：
1. 书名要简洁有力，2-8个字为宜
2. 要能引起读者好奇心
3. 符合网文平台的命名风格
4. 避免过于普通或烂大街的名字
5. 每个书名风格要有差异

请严格按照以下JSON格式返回（只返回纯JSON）：

{
  "titles": ["书名1", "书名2", "书名3", "书名4", "书名5"]
}

只返回JSON，不要有任何解释文字。`

  try {
    const text = await generateText(prompt)
    let jsonStr = text.trim()
    const jsonMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/)
    if (jsonMatch) {
      jsonStr = jsonMatch[1].trim()
    }
    const startIndex = jsonStr.indexOf('{')
    const endIndex = jsonStr.lastIndexOf('}')
    if (startIndex !== -1 && endIndex !== -1) {
      jsonStr = jsonStr.substring(startIndex, endIndex + 1)
    }
    const data = JSON.parse(jsonStr)
    return data.titles || []
  } catch (error) {
    console.error('Failed to parse title response:', error)
    return []
  }
}

// 导出类型
export type { AIProvider, ProviderType, QuotaInfo, ModelInfo, ProviderConfig }
export { PROVIDER_INFO, PROVIDERS_BY_REGION }
