/**
 * 情感弧线追踪系统 - 优化节奏把控
 *
 * 功能：
 * 1. 追踪章节情绪变化
 * 2. 分析情感趋势
 * 3. 建议下一章情绪走向
 * 4. 检测节奏问题
 */

import { generateText } from './gemini'
import type {
  EmotionPoint,
  EmotionalArc,
  EmotionSuggestion
} from '../types/memory'

/**
 * 从章节内容分析情感数据
 */
export async function analyzeChapterEmotion(
  chapterContent: string,
  chapterIndex: number
): Promise<EmotionPoint> {
  const prompt = `你是一个专业的小说编辑，请分析以下章节的情感数据。

【章节内容】
${chapterContent.slice(0, 2500)}

请返回JSON格式的情感分析结果：

\`\`\`json
{
  "emotion": "主导情绪（如：紧张、悲伤、愤怒、喜悦、恐惧、期待等）",
  "intensity": 7,
  "tension": 6,
  "hope": 3
}
\`\`\`

字段说明：
- emotion: 本章的主导情绪
- intensity: 情绪强度（0-10，0=平淡，10=极端）
- tension: 情节张力（0-10，0=无冲突，10=极度紧张）
- hope: 希望值（-10到10，负值=绝望/压抑，正值=希望/光明）

只输出JSON，不要解释。`

  try {
    const result = await generateText(prompt)
    const jsonMatch = result.match(/```json\s*([\s\S]*?)\s*```/) || result.match(/\{[\s\S]*\}/)

    if (!jsonMatch) {
      return {
        chapter: chapterIndex,
        emotion: 'neutral',
        intensity: 5,
        tension: 5,
        hope: 0
      }
    }

    const parsed = JSON.parse(jsonMatch[1] || jsonMatch[0])
    return {
      chapter: chapterIndex,
      emotion: parsed.emotion || 'neutral',
      intensity: Math.min(10, Math.max(0, parsed.intensity || 5)),
      tension: Math.min(10, Math.max(0, parsed.tension || 5)),
      hope: Math.min(10, Math.max(-10, parsed.hope || 0))
    }
  } catch (e) {
    console.error('Failed to analyze chapter emotion:', e)
    return {
      chapter: chapterIndex,
      emotion: 'neutral',
      intensity: 5,
      tension: 5,
      hope: 0
    }
  }
}

/**
 * 构建完整的情感弧线
 */
export function buildEmotionalArc(points: EmotionPoint[]): EmotionalArc {
  if (points.length === 0) {
    return {
      chapters: [],
      overallTrend: 'stable',
      peakChapters: [],
      valleyChapters: []
    }
  }

  // 排序
  const sorted = [...points].sort((a, b) => a.chapter - b.chapter)

  // 计算趋势
  const trend = calculateTrend(sorted)

  // 找出高潮和低谷
  const peakChapters: number[] = []
  const valleyChapters: number[] = []

  for (let i = 1; i < sorted.length - 1; i++) {
    const prev = sorted[i - 1].intensity
    const curr = sorted[i].intensity
    const next = sorted[i + 1].intensity

    // 局部最大值
    if (curr > prev && curr > next && curr >= 7) {
      peakChapters.push(sorted[i].chapter)
    }
    // 局部最小值
    if (curr < prev && curr < next && curr <= 3) {
      valleyChapters.push(sorted[i].chapter)
    }
  }

  // 生成建议
  const suggestion = generateSuggestion(sorted)

  return {
    chapters: sorted,
    overallTrend: trend,
    peakChapters,
    valleyChapters,
    suggestion
  }
}

/**
 * 计算整体趋势
 */
function calculateTrend(points: EmotionPoint[]): 'rising' | 'falling' | 'fluctuating' | 'stable' {
  if (points.length < 3) return 'stable'

  const recent = points.slice(-5)
  const intensities = recent.map(p => p.intensity)

  let rises = 0
  let falls = 0

  for (let i = 1; i < intensities.length; i++) {
    const diff = intensities[i] - intensities[i - 1]
    if (diff > 1) rises++
    else if (diff < -1) falls++
  }

  if (rises > falls + 1) return 'rising'
  if (falls > rises + 1) return 'falling'
  if (rises > 0 && falls > 0) return 'fluctuating'
  return 'stable'
}

/**
 * 生成下一章情绪建议
 */
function generateSuggestion(points: EmotionPoint[]): EmotionSuggestion | undefined {
  if (points.length < 3) return undefined

  const recent = points.slice(-5)

  // 检测情绪疲劳（连续高强度）
  if (recent.every(c => c.intensity > 7)) {
    return {
      suggestion: '建议降低情绪强度，给读者喘息空间',
      targetIntensity: 4,
      targetTension: 3,
      reason: '连续5章高强度场景，需要节奏调整'
    }
  }

  // 检测平淡过长
  if (recent.every(c => c.intensity < 4)) {
    return {
      suggestion: '建议增加冲突，提升情绪张力',
      targetIntensity: 7,
      targetTension: 6,
      reason: '连续5章低强度场景，需要制造爽点'
    }
  }

  // 检测持续紧张
  if (recent.every(c => c.tension > 7)) {
    return {
      suggestion: '建议适当放松张力，避免读者疲劳',
      targetIntensity: 5,
      targetTension: 3,
      reason: '持续高张力，需要舒缓'
    }
  }

  // 检测希望值持续低迷
  if (recent.every(c => c.hope < -3)) {
    return {
      suggestion: '建议加入希望元素，避免过度压抑',
      targetIntensity: 6,
      targetTension: 5,
      reason: '持续绝望氛围，需要转机'
    }
  }

  // 检测长时间无高潮
  if (recent.length >= 5 && recent.every(c => c.intensity < 7)) {
    return {
      suggestion: '建议安排一个小高潮，保持读者兴趣',
      targetIntensity: 8,
      targetTension: 7,
      reason: '近5章无高潮，需要爽点'
    }
  }

  return undefined
}

/**
 * 生成情感弧线写作提示
 */
export function generateEmotionGuidance(arc: EmotionalArc): string {
  if (!arc.suggestion) {
    return ''
  }

  const { suggestion, targetIntensity, targetTension, reason } = arc.suggestion

  return `【情感弧线建议】
${suggestion}

- 目标情绪强度: ${targetIntensity}/10
- 目标张力: ${targetTension}/10
- 原因: ${reason}

【趋势分析】
- 当前趋势: ${arc.overallTrend === 'rising' ? '上升' : arc.overallTrend === 'falling' ? '下降' : arc.overallTrend === 'fluctuating' ? '波动' : '平稳'}
- 近期高潮: 第${arc.peakChapters.slice(-3).join('、') || '无'}章
- 近期低谷: 第${arc.valleyChapters.slice(-3).join('、') || '无'}章
`
}

/**
 * 检测节奏问题
 */
export function detectRhythmIssues(arc: EmotionalArc): string[] {
  const issues: string[] = []
  const points = arc.chapters

  if (points.length < 10) return issues

  // 检测连续平淡
  let flatStreak = 0
  for (const p of points.slice(-10)) {
    if (p.intensity < 5) flatStreak++
    else flatStreak = 0

    if (flatStreak >= 5) {
      issues.push(`连续${flatStreak}章情绪平淡，建议增加冲突`)
      break
    }
  }

  // 检测连续高潮
  let highStreak = 0
  for (const p of points.slice(-10)) {
    if (p.intensity > 7) highStreak++
    else highStreak = 0

    if (highStreak >= 4) {
      issues.push(`连续${highStreak}章高强度，建议安排喘息`)
      break
    }
  }

  // 检测情绪单一
  const emotions = points.slice(-10).map(p => p.emotion)
  const uniqueEmotions = new Set(emotions)
  if (uniqueEmotions.size <= 2) {
    issues.push(`近10章情绪类型单一，建议丰富情感变化`)
  }

  // 检测缺乏波动
  const intensities = points.slice(-10).map(p => p.intensity)
  const maxI = Math.max(...intensities)
  const minI = Math.min(...intensities)
  if (maxI - minI < 3) {
    issues.push(`近10章情绪波动过小（${minI}-${maxI}），建议增加起伏`)
  }

  return issues
}

/**
 * 生成情感弧线可视化数据（用于图表）
 */
export function getArcVisualizationData(arc: EmotionalArc): {
  labels: string[]
  intensity: number[]
  tension: number[]
  hope: number[]
} {
  return {
    labels: arc.chapters.map(c => `第${c.chapter}章`),
    intensity: arc.chapters.map(c => c.intensity),
    tension: arc.chapters.map(c => c.tension),
    hope: arc.chapters.map(c => c.hope)
  }
}

/**
 * 根据大纲预估情感走向
 */
export async function estimateEmotionFromOutline(
  outline: string
): Promise<Partial<EmotionPoint>> {
  const prompt = `分析以下章节大纲，预估其情感走向。

【大纲】
${outline}

返回JSON：
\`\`\`json
{
  "emotion": "预期主导情绪",
  "intensity": 6,
  "tension": 5,
  "hope": 2
}
\`\`\`

只输出JSON。`

  try {
    const result = await generateText(prompt)
    const jsonMatch = result.match(/```json\s*([\s\S]*?)\s*```/) || result.match(/\{[\s\S]*\}/)

    if (jsonMatch) {
      return JSON.parse(jsonMatch[1] || jsonMatch[0])
    }
  } catch (e) {
    console.error('Failed to estimate emotion:', e)
  }

  return { intensity: 5, tension: 5, hope: 0 }
}
