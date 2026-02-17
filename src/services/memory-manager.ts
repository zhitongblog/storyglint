/**
 * 分层记忆管理器 - 整合所有记忆系统
 *
 * 功能：
 * 1. 管理三层记忆结构
 * 2. 智能更新记忆
 * 3. 生成写作上下文
 * 4. 检测重大事件触发更新
 */

import { generateText } from './gemini'
import type {
  LayeredMemory,
  CoreMemory,
  WorldState,
  RecentMemory,
  CharacterState,
  ChapterSummary
} from '../types/memory'
import type { Character, Volume, Chapter } from '../types'
import { analyzeChapterEmotion } from './emotional-arc'
import { detectPlotThreads } from './plot-tracker'

// ==================== 核心记忆管理 ====================

/**
 * 从世界观设定提取核心记忆
 */
export async function extractCoreMemory(worldSetting: string): Promise<CoreMemory> {
  const prompt = `分析以下世界观设定，提取核心要素。

【世界观设定】
${worldSetting}

请返回JSON格式：
\`\`\`json
{
  "worldRules": "世界的核心规则，100字以内",
  "powerSystem": "力量/修炼体系，100字以内",
  "mainConflict": "核心矛盾/主线冲突，50字以内",
  "keyLocations": ["重要地点1", "重要地点2"],
  "factions": ["势力1", "势力2"]
}
\`\`\`

只输出JSON，提取最关键的设定。`

  try {
    const result = await generateText(prompt)
    const jsonMatch = result.match(/```json\s*([\s\S]*?)\s*```/) || result.match(/\{[\s\S]*\}/)

    if (jsonMatch) {
      return JSON.parse(jsonMatch[1] || jsonMatch[0])
    }
  } catch (e) {
    console.error('Failed to extract core memory:', e)
  }

  return {
    worldRules: worldSetting.slice(0, 200),
    powerSystem: '',
    mainConflict: '',
    keyLocations: [],
    factions: []
  }
}

// ==================== 世界状态管理 ====================

/**
 * 从角色列表初始化角色状态
 */
export function initializeCharacterStates(characters: Character[]): CharacterState[] {
  return characters.map(c => ({
    characterId: c.id,
    name: c.name,
    isAlive: c.status !== 'deceased',
    deathChapter: c.deathChapter ? parseInt(c.deathChapter) : undefined,
    currentPower: '',
    currentLocation: '',
    currentMood: '',
    recentEvents: []
  }))
}

/**
 * 分析章节内容，更新世界状态
 */
export async function analyzeChapterForWorldState(
  chapterContent: string,
  chapterIndex: number,
  currentState: WorldState,
  characters: Character[]
): Promise<Partial<WorldState>> {
  const characterNames = characters.map(c => c.name).join('、')

  const prompt = `分析以下章节内容，提取状态变化。

【章节内容】
${chapterContent.slice(0, 2500)}

【角色列表】
${characterNames}

请返回JSON格式：
\`\`\`json
{
  "characterChanges": [
    {
      "name": "角色名",
      "changes": {
        "isAlive": true,
        "currentPower": "境界变化（如有）",
        "currentLocation": "当前位置",
        "currentMood": "当前心境",
        "recentEvent": "本章重要事件"
      }
    }
  ],
  "newConflicts": [
    {
      "description": "冲突描述",
      "participants": ["角色1", "角色2"],
      "urgency": "low|medium|high|critical"
    }
  ],
  "resolvedConflicts": ["已解决的冲突描述"],
  "majorEvents": ["重大事件1", "重大事件2"]
}
\`\`\`

只输出JSON，只记录本章发生变化的内容。`

  try {
    const result = await generateText(prompt)
    const jsonMatch = result.match(/```json\s*([\s\S]*?)\s*```/) || result.match(/\{[\s\S]*\}/)

    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[1] || jsonMatch[0])

      // 更新角色状态
      const updatedCharacterStates = [...currentState.characterStates]
      for (const change of parsed.characterChanges || []) {
        const idx = updatedCharacterStates.findIndex(c => c.name === change.name)
        if (idx >= 0) {
          const updated = { ...updatedCharacterStates[idx] }
          if (change.changes.isAlive !== undefined) updated.isAlive = change.changes.isAlive
          if (change.changes.currentPower) updated.currentPower = change.changes.currentPower
          if (change.changes.currentLocation) updated.currentLocation = change.changes.currentLocation
          if (change.changes.currentMood) updated.currentMood = change.changes.currentMood
          if (change.changes.recentEvent) {
            updated.recentEvents = [...updated.recentEvents.slice(-4), change.changes.recentEvent]
          }
          if (!change.changes.isAlive && !updated.deathChapter) {
            updated.deathChapter = chapterIndex
          }
          updatedCharacterStates[idx] = updated
        }
      }

      // 更新冲突
      const updatedConflicts = [...currentState.activeConflicts]
      for (const conflict of parsed.newConflicts || []) {
        updatedConflicts.push({
          id: `conflict_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          description: conflict.description,
          participants: conflict.participants,
          startChapter: chapterIndex,
          status: 'ongoing',
          urgency: conflict.urgency
        })
      }

      // 标记已解决的冲突
      for (const resolved of parsed.resolvedConflicts || []) {
        const idx = updatedConflicts.findIndex(c =>
          c.description.includes(resolved) && c.status === 'ongoing'
        )
        if (idx >= 0) {
          updatedConflicts[idx] = { ...updatedConflicts[idx], status: 'resolving' }
        }
      }

      return {
        characterStates: updatedCharacterStates,
        activeConflicts: updatedConflicts,
        lastUpdatedChapter: chapterIndex
      }
    }
  } catch (e) {
    console.error('Failed to analyze chapter for world state:', e)
  }

  return { lastUpdatedChapter: chapterIndex }
}

// ==================== 近期记忆管理 ====================

/**
 * 生成章节摘要
 */
export async function generateChapterSummary(
  chapterContent: string,
  chapterTitle: string,
  chapterIndex: number
): Promise<ChapterSummary> {
  const prompt = `为以下章节生成摘要信息。

【章节标题】${chapterTitle}
【章节内容】
${chapterContent.slice(0, 2000)}

请返回JSON格式：
\`\`\`json
{
  "summary": "50-80字的简要摘要",
  "keyEvents": ["关键事件1", "关键事件2"],
  "charactersAppeared": ["出场角色1", "出场角色2"],
  "emotionalTone": "情绪基调",
  "hasMajorTurn": false
}
\`\`\`

只输出JSON。`

  try {
    const result = await generateText(prompt)
    const jsonMatch = result.match(/```json\s*([\s\S]*?)\s*```/) || result.match(/\{[\s\S]*\}/)

    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[1] || jsonMatch[0])
      return {
        chapterIndex,
        title: chapterTitle,
        summary: parsed.summary,
        keyEvents: parsed.keyEvents || [],
        charactersAppeared: parsed.charactersAppeared || [],
        emotionalTone: parsed.emotionalTone || '',
        hasMajorTurn: parsed.hasMajorTurn || false
      }
    }
  } catch (e) {
    console.error('Failed to generate chapter summary:', e)
  }

  return {
    chapterIndex,
    title: chapterTitle,
    summary: chapterContent.slice(0, 100),
    keyEvents: [],
    charactersAppeared: [],
    emotionalTone: '',
    hasMajorTurn: false
  }
}

/**
 * 更新近期记忆
 */
export async function updateRecentMemory(
  current: RecentMemory,
  chapterContent: string,
  chapterTitle: string,
  chapterIndex: number,
  maxChapters: number = 5
): Promise<RecentMemory> {
  // 生成章节摘要
  const summary = await generateChapterSummary(chapterContent, chapterTitle, chapterIndex)

  // 分析情感
  const emotion = await analyzeChapterEmotion(chapterContent, chapterIndex)

  // 更新摘要列表（保留最近N章）
  const lastChapters = [...current.lastChapters, summary].slice(-maxChapters)

  // 更新情感弧线
  const emotionalArc = [...current.emotionalArc, emotion].slice(-20)

  // 提取重要事件
  const recentEvents = [...current.recentEvents]
  for (const event of summary.keyEvents) {
    recentEvents.push({
      chapter: chapterIndex,
      description: event,
      importance: summary.hasMajorTurn ? 'high' : 'medium',
      relatedCharacters: summary.charactersAppeared
    })
  }

  return {
    lastChapters,
    recentEvents: recentEvents.slice(-20),
    emotionalArc
  }
}

// ==================== 重大事件检测 ====================

/**
 * 检测是否发生需要立即更新记忆的重大事件
 */
export interface MajorEventType {
  type: 'character_death' | 'power_up' | 'major_conflict' | 'plot_resolution' | 'new_arc'
  description: string
  urgency: 'immediate' | 'soon' | 'normal'
}

export async function detectMajorEvents(
  chapterContent: string,
  characters: Character[]
): Promise<MajorEventType[]> {
  const characterNames = characters.map(c => c.name).join('、')

  const prompt = `分析以下章节，检测是否有重大事件发生。

【章节内容】
${chapterContent.slice(0, 2000)}

【角色列表】
${characterNames}

检测以下类型的重大事件：
1. character_death - 角色死亡
2. power_up - 主角突破/获得重要能力
3. major_conflict - 重大冲突爆发
4. plot_resolution - 重要伏笔揭晓
5. new_arc - 新篇章/新剧情开始

请返回JSON：
\`\`\`json
{
  "events": [
    {
      "type": "事件类型",
      "description": "事件描述",
      "urgency": "immediate|soon|normal"
    }
  ]
}
\`\`\`

如果没有重大事件，返回空数组。只输出JSON。`

  try {
    const result = await generateText(prompt)
    const jsonMatch = result.match(/```json\s*([\s\S]*?)\s*```/) || result.match(/\{[\s\S]*\}/)

    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[1] || jsonMatch[0])
      return parsed.events || []
    }
  } catch (e) {
    console.error('Failed to detect major events:', e)
  }

  return []
}

/**
 * 判断是否应该更新记忆
 */
export function shouldUpdateMemory(
  chapterIndex: number,
  lastUpdateChapter: number,
  events: MajorEventType[],
  config: { intervalChapters: number }
): boolean {
  // 重大事件触发立即更新
  if (events.some(e => e.urgency === 'immediate')) {
    return true
  }

  // 定期更新
  if (chapterIndex - lastUpdateChapter >= config.intervalChapters) {
    return true
  }

  // 即将到期的重大事件
  if (events.some(e => e.urgency === 'soon') && chapterIndex - lastUpdateChapter >= 5) {
    return true
  }

  return false
}

// ==================== 写作上下文生成 ====================

/**
 * 从分层记忆生成写作上下文
 */
export function generateWritingContext(memory: LayeredMemory): string {
  const parts: string[] = []

  // 核心设定（压缩）
  parts.push(`【世界观核心】
${memory.core.worldRules}
力量体系：${memory.core.powerSystem}
核心矛盾：${memory.core.mainConflict}`)

  // 角色当前状态
  const aliveChars = memory.worldState.characterStates.filter(c => c.isAlive)
  const deadChars = memory.worldState.characterStates.filter(c => !c.isAlive)

  if (aliveChars.length > 0) {
    parts.push(`【角色状态】
${aliveChars.slice(0, 6).map(c =>
      `${c.name}：${c.currentPower || '未知境界'}，${c.currentMood || '正常'}，${c.currentLocation || '位置未知'}`
    ).join('\n')}`)
  }

  if (deadChars.length > 0) {
    parts.push(`【已死亡角色 - 禁止出场】
${deadChars.map(c => `${c.name}（第${c.deathChapter}章死亡）`).join('、')}`)
  }

  // 进行中的冲突
  const activeConflicts = memory.worldState.activeConflicts.filter(c => c.status === 'ongoing')
  if (activeConflicts.length > 0) {
    parts.push(`【进行中的冲突】
${activeConflicts.map(c => `- ${c.description}（${c.urgency}级）`).join('\n')}`)
  }

  // 未解决的伏笔
  const activePlots = memory.worldState.unresolvedPlots.filter(p =>
    p.status === 'active' || p.status === 'hinted'
  )
  if (activePlots.length > 0) {
    parts.push(`【未解决的伏笔】
${activePlots.slice(0, 5).map(p => `- ${p.description}`).join('\n')}`)
  }

  // 近期摘要
  if (memory.recent.lastChapters.length > 0) {
    parts.push(`【近期剧情】
${memory.recent.lastChapters.map(c =>
      `第${c.chapterIndex}章 ${c.title}：${c.summary}`
    ).join('\n')}`)
  }

  return parts.join('\n\n')
}

/**
 * 计算上下文的token估算（粗略）
 */
export function estimateContextTokens(context: string): number {
  // 中文约2字符一个token，英文约4字符一个token
  const chineseChars = (context.match(/[\u4e00-\u9fff]/g) || []).length
  const otherChars = context.length - chineseChars
  return Math.ceil(chineseChars / 2 + otherChars / 4)
}
