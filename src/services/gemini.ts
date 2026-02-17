/**
 * Gemini Service - Backward Compatibility Layer
 *
 * 此文件为向后兼容层，保持原有的导出接口不变
 * 内部调用新的 AI 服务管理器
 *
 * @deprecated 推荐直接使用 src/services/ai 中的新接口
 */

import {
  initAI,
  isAIReady,
  generateText as aiGenerateText,
  generateTextStream as aiGenerateTextStream,
  switchModel as aiSwitchModel,
  checkQuota as aiCheckQuota,
  getAvailableModels,
  getCurrentModelName,
  findAvailableModel as aiFindAvailableModel,
  generateCoverImage as aiGenerateCoverImage,
  generateOutline as aiGenerateOutline,
  generateCharacter as aiGenerateCharacter,
  generateContent as aiGenerateContent,
  polishContent as aiPolishContent,
  generateSummary as aiGenerateSummary,
  continueWriting as aiContinueWriting,
  analyzeChapterForDeaths as aiAnalyzeChapterForDeaths,
  analyzeChapterForCharacters as aiAnalyzeChapterForCharacters,
  analyzeAllChaptersForArchive as aiAnalyzeAllChaptersForArchive,
  generateBookTitle as aiGenerateBookTitle,
  setProvider,
  getCurrentProviderType
} from './ai'
import type { QuotaInfo, ModelInfo } from './ai'

// 导出模型配置（保持向后兼容）
export const AVAILABLE_MODELS: Record<string, ModelInfo> = getAvailableModels()

/**
 * 初始化 Gemini API
 * @deprecated 使用 initAI 代替
 */
export async function initGemini(apiKey: string, modelName?: string): Promise<boolean> {
  // 确保使用 Gemini 提供商
  if (getCurrentProviderType() !== 'gemini') {
    setProvider('gemini')
  }
  return initAI(apiKey, modelName)
}

/**
 * 切换模型
 */
export async function switchModel(modelName: keyof typeof AVAILABLE_MODELS): Promise<boolean> {
  return aiSwitchModel(modelName as string)
}

/**
 * 检查是否已初始化
 */
export function isGeminiReady(): boolean {
  return isAIReady()
}

/**
 * 生成文本内容
 */
export async function generateText(
  prompt: string,
  retries: number = 2,
  timeout: number = 60000
): Promise<string> {
  return aiGenerateText(prompt, retries, timeout)
}

/**
 * 流式生成文本
 */
export async function* generateTextStream(
  prompt: string
): AsyncGenerator<string, void, unknown> {
  yield* aiGenerateTextStream(prompt)
}

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
  return aiGenerateOutline(inspiration, constraints, scale, genres, styles)
}

/**
 * 生成角色设定
 */
export async function generateCharacter(
  name: string,
  role: string,
  context: string
): Promise<string> {
  return aiGenerateCharacter(name, role, context)
}

/**
 * 生成正文内容
 */
export async function generateContent(
  outline: string,
  previousContent: string,
  style: string
): Promise<string> {
  return aiGenerateContent(outline, previousContent, style)
}

/**
 * 润色内容
 */
export async function polishContent(content: string): Promise<string> {
  return aiPolishContent(content)
}

/**
 * 生成故事摘要
 */
export async function generateSummary(content: string): Promise<string> {
  return aiGenerateSummary(content)
}

/**
 * AI 续写
 */
export async function continueWriting(
  currentContent: string,
  wordCount: number = 500
): Promise<string> {
  return aiContinueWriting(currentContent, wordCount)
}

/**
 * 生成小说封面图片
 */
export async function generateCoverImage(
  bookTitle: string,
  authorName: string,
  style: string,
  genres: string[]
): Promise<string> {
  return aiGenerateCoverImage(bookTitle, authorName, style, genres)
}

/**
 * 获取当前使用的模型名称
 */
export { getCurrentModelName }

/**
 * 配额检查结果类型
 */
export type { QuotaInfo }

/**
 * 检查 API 配额和健康状态
 */
export async function checkQuota(): Promise<QuotaInfo> {
  return aiCheckQuota()
}

/**
 * 测试所有可用模型，找到可用的模型
 */
export async function findAvailableModel(): Promise<{
  availableModel: string | null
  results: Record<string, { available: boolean; error?: string }>
}> {
  return aiFindAvailableModel()
}

/**
 * 快速分析单章内容，检测角色死亡事件
 */
export async function analyzeChapterForDeaths(
  chapterTitle: string,
  chapterContent: string,
  characterNames: string[]
): Promise<{
  deaths: { name: string; description: string }[]
  confidence: 'high' | 'medium' | 'low'
}> {
  return aiAnalyzeChapterForDeaths(chapterTitle, chapterContent, characterNames)
}

/**
 * 分析章节内容，更新角色档案
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
  return aiAnalyzeChapterForCharacters(chapterTitle, chapterContent, characterNames)
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
  return aiAnalyzeAllChaptersForArchive(chapters, characterNames, onProgress)
}

/**
 * 根据灵感生成书名建议
 */
export async function generateBookTitle(
  inspiration: string,
  genres: string[],
  count: number = 5
): Promise<string[]> {
  return aiGenerateBookTitle(inspiration, genres, count)
}
