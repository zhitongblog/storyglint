/**
 * 大纲边界验证器 - 防止内容越界
 *
 * 功能：
 * 1. 检测生成的大纲是否重复了过去章节的内容
 * 2. 检测是否提前写了未来章节/卷的内容
 * 3. 验证章节内容边界是否正确
 */

import type { Chapter, Volume } from '../types'

// 验证结果接口
export interface ValidationResult {
  isValid: boolean
  errors: ValidationError[]
  warnings: ValidationWarning[]
}

export interface ValidationError {
  type: 'past_repeat' | 'future_leak' | 'boundary_violation'
  chapterNumber: number
  chapterTitle: string
  description: string
  conflictSource?: string  // 冲突来源（哪一章/哪一卷）
  severity: 'high' | 'medium' | 'low'
}

export interface ValidationWarning {
  type: 'similar_content' | 'potential_overlap'
  chapterNumber: number
  description: string
}

// 事件边界定义
export interface VolumeBoundary {
  volumeIndex: number
  volumeTitle: string
  // 本卷必须完成的事件（从卷摘要/关键事件提取）
  mustCompleteEvents: string[]
  // 本卷不能涉及的事件（下一卷的关键事件）
  forbiddenEvents: string[]
  // 本卷已完成的事件（上一卷的关键事件，不可重复）
  completedEvents: string[]
  // 本卷的起始状态（上一卷结尾的状态）
  startingState?: string
  // 本卷的结束状态（预期到达的状态）
  endingState?: string
}

/**
 * 从卷信息中提取关键事件
 */
export function extractKeyEvents(
  volumeSummary: string,
  keyEvents?: string[],
  mainPlot?: string
): string[] {
  const events: string[] = []

  // 1. 从明确的关键事件中提取
  if (keyEvents && keyEvents.length > 0) {
    events.push(...keyEvents)
  }

  // 2. 从主线剧情中提取关键词
  if (mainPlot) {
    // 提取动作性关键词
    const actionPatterns = [
      /击败|战胜|打败|消灭|杀死|斩杀|覆灭/g,
      /突破|晋级|进阶|觉醒|获得|得到|习得/g,
      /发现|揭露|揭开|知道|了解|真相/g,
      /结盟|联合|背叛|反目|决裂/g,
      /逃离|离开|进入|到达|返回/g,
      /比赛|大赛|考核|试炼|挑战/g
    ]

    for (const pattern of actionPatterns) {
      const matches = mainPlot.match(pattern)
      if (matches) {
        events.push(...matches)
      }
    }
  }

  // 3. 从卷摘要中提取（更简化的方式）
  if (volumeSummary) {
    // 提取关键名词和动作
    const importantPhrases = volumeSummary.match(/[^，。！？、]+[击败|突破|获得|发现|进入|离开|对抗|挑战|参加][^，。！？、]*/g)
    if (importantPhrases) {
      events.push(...importantPhrases.slice(0, 3))
    }
  }

  // 去重
  return [...new Set(events)]
}

/**
 * 构建卷边界信息
 */
export function buildVolumeBoundary(
  currentVolume: Volume,
  volumeIndex: number,
  previousVolume?: Volume,
  nextVolume?: Volume
): VolumeBoundary {
  const boundary: VolumeBoundary = {
    volumeIndex,
    volumeTitle: currentVolume.title,
    mustCompleteEvents: [],
    forbiddenEvents: [],
    completedEvents: []
  }

  // 本卷必须完成的事件
  if (currentVolume.keyPoints) {
    boundary.mustCompleteEvents = [...currentVolume.keyPoints]
  } else {
    boundary.mustCompleteEvents = extractKeyEvents(
      currentVolume.summary,
      undefined,
      (currentVolume as any).mainPlot
    )
  }

  // 上一卷已完成的事件（不可重复）
  if (previousVolume) {
    if (previousVolume.keyPoints) {
      boundary.completedEvents = [...previousVolume.keyPoints]
    } else {
      boundary.completedEvents = extractKeyEvents(
        previousVolume.summary,
        undefined,
        (previousVolume as any).mainPlot
      )
    }
    boundary.startingState = `承接《${previousVolume.title}》结尾`
  }

  // 下一卷的事件（不可提前写）
  if (nextVolume) {
    if (nextVolume.keyPoints) {
      boundary.forbiddenEvents = [...nextVolume.keyPoints]
    } else {
      boundary.forbiddenEvents = extractKeyEvents(
        nextVolume.summary,
        undefined,
        (nextVolume as any).mainPlot
      )
    }
    boundary.endingState = `为《${nextVolume.title}》做铺垫`
  }

  return boundary
}

/**
 * 检测文本相似度（简单实现）
 */
function calculateSimilarity(text1: string, text2: string): number {
  if (!text1 || !text2) return 0

  const words1 = new Set(text1.split(/[，。！？、\s]+/).filter(w => w.length > 1))
  const words2 = new Set(text2.split(/[，。！？、\s]+/).filter(w => w.length > 1))

  if (words1.size === 0 || words2.size === 0) return 0

  let intersection = 0
  for (const word of words1) {
    if (words2.has(word)) {
      intersection++
    }
  }

  return intersection / Math.min(words1.size, words2.size)
}

/**
 * 检测大纲是否包含禁止的事件
 */
function containsForbiddenEvent(outline: string, forbiddenEvents: string[]): string | null {
  const outlineLower = outline.toLowerCase()

  for (const event of forbiddenEvents) {
    // 关键词匹配
    const keywords = event.split(/[，。、\s]+/).filter(w => w.length > 1)
    let matchCount = 0

    for (const keyword of keywords) {
      if (outlineLower.includes(keyword.toLowerCase())) {
        matchCount++
      }
    }

    // 如果超过60%的关键词匹配，认为包含了这个事件
    if (keywords.length > 0 && matchCount / keywords.length > 0.6) {
      return event
    }
  }

  return null
}

/**
 * 验证生成的章节大纲
 */
export function validateGeneratedOutlines(
  generatedChapters: { chapterNumber: number; title: string; outline: string }[],
  boundary: VolumeBoundary,
  existingChapters?: Chapter[],
  previousVolumeChapters?: Chapter[]
): ValidationResult {
  const errors: ValidationError[] = []
  const warnings: ValidationWarning[] = []

  for (const chapter of generatedChapters) {
    const fullContent = `${chapter.title} ${chapter.outline}`

    // 1. 检测是否重复了上一卷的内容
    if (boundary.completedEvents.length > 0) {
      const conflictEvent = containsForbiddenEvent(fullContent, boundary.completedEvents)
      if (conflictEvent) {
        errors.push({
          type: 'past_repeat',
          chapterNumber: chapter.chapterNumber,
          chapterTitle: chapter.title,
          description: `疑似重复上一卷已完成的事件`,
          conflictSource: conflictEvent,
          severity: 'high'
        })
      }
    }

    // 2. 检测是否提前写了下一卷的内容
    if (boundary.forbiddenEvents.length > 0) {
      const conflictEvent = containsForbiddenEvent(fullContent, boundary.forbiddenEvents)
      if (conflictEvent) {
        errors.push({
          type: 'future_leak',
          chapterNumber: chapter.chapterNumber,
          chapterTitle: chapter.title,
          description: `疑似提前写了下一卷的内容`,
          conflictSource: conflictEvent,
          severity: 'high'
        })
      }
    }

    // 3. 检测与上一卷章节的相似度
    if (previousVolumeChapters && previousVolumeChapters.length > 0) {
      for (const prevChapter of previousVolumeChapters) {
        const prevContent = `${prevChapter.title} ${prevChapter.outline}`
        const similarity = calculateSimilarity(fullContent, prevContent)

        if (similarity > 0.7) {
          errors.push({
            type: 'past_repeat',
            chapterNumber: chapter.chapterNumber,
            chapterTitle: chapter.title,
            description: `与上一卷《${prevChapter.title}》高度相似(${Math.round(similarity * 100)}%)`,
            conflictSource: prevChapter.title,
            severity: 'high'
          })
        } else if (similarity > 0.5) {
          warnings.push({
            type: 'similar_content',
            chapterNumber: chapter.chapterNumber,
            description: `与上一卷《${prevChapter.title}》有一定相似度(${Math.round(similarity * 100)}%)`
          })
        }
      }
    }

    // 4. 检测与本卷已有章节的相似度
    if (existingChapters && existingChapters.length > 0) {
      for (const existChapter of existingChapters) {
        const existContent = `${existChapter.title} ${existChapter.outline}`
        const similarity = calculateSimilarity(fullContent, existContent)

        if (similarity > 0.7) {
          errors.push({
            type: 'past_repeat',
            chapterNumber: chapter.chapterNumber,
            chapterTitle: chapter.title,
            description: `与本卷已有章节《${existChapter.title}》高度相似`,
            conflictSource: existChapter.title,
            severity: 'medium'
          })
        }
      }
    }
  }

  // 5. 检查是否完成了必须完成的事件（仅作为警告）
  const allContent = generatedChapters.map(c => `${c.title} ${c.outline}`).join(' ')
  for (const mustEvent of boundary.mustCompleteEvents) {
    const keywords = mustEvent.split(/[，。、\s]+/).filter(w => w.length > 1)
    let matchCount = 0

    for (const keyword of keywords) {
      if (allContent.includes(keyword)) {
        matchCount++
      }
    }

    if (keywords.length > 0 && matchCount / keywords.length < 0.3) {
      warnings.push({
        type: 'potential_overlap',
        chapterNumber: 0,
        description: `本卷可能未完成关键事件：${mustEvent}`
      })
    }
  }

  return {
    isValid: errors.filter(e => e.severity === 'high').length === 0,
    errors,
    warnings
  }
}

/**
 * 生成边界约束提示词（增强版）
 */
export function buildBoundaryConstraintPrompt(boundary: VolumeBoundary): string {
  let prompt = ''

  // 强制约束区域
  prompt += '\n\n╔══════════════════════════════════════════════╗\n'
  prompt += '║           【🚨 内容边界强制约束】              ║\n'
  prompt += '╚══════════════════════════════════════════════╝\n\n'

  // 禁止区域 - 过去的内容
  if (boundary.completedEvents.length > 0) {
    prompt += '🔴【禁区一：过去已完成】以下事件已在上一卷完成，本卷严禁重写：\n'
    boundary.completedEvents.forEach((event, i) => {
      prompt += `   ${i + 1}. ❌ ${event}\n`
    })
    prompt += '   → 这些是历史，不可改变，不可重演\n\n'
  }

  // 禁止区域 - 未来的内容
  if (boundary.forbiddenEvents.length > 0) {
    prompt += '🔴【禁区二：未来不可触碰】以下事件属于下一卷，本卷严禁提前写：\n'
    boundary.forbiddenEvents.forEach((event, i) => {
      prompt += `   ${i + 1}. ⛔ ${event}\n`
    })
    prompt += '   → 这些是未来，只能埋伏笔，不能直接写出\n\n'
  }

  // 本卷任务
  if (boundary.mustCompleteEvents.length > 0) {
    prompt += '🟢【本卷核心任务】以下事件必须在本卷中完成或推进：\n'
    boundary.mustCompleteEvents.forEach((event, i) => {
      prompt += `   ${i + 1}. ✅ ${event}\n`
    })
    prompt += '   → 这些是本卷的主线，必须聚焦\n\n'
  }

  // 边界状态
  if (boundary.startingState) {
    prompt += `📍【起始状态】${boundary.startingState}\n`
  }
  if (boundary.endingState) {
    prompt += `🎯【目标状态】${boundary.endingState}\n`
  }

  prompt += '\n⚠️ 每一章大纲都会被系统自动检测，如果违反上述约束将被标记为错误！\n'

  return prompt
}

/**
 * 格式化验证结果供用户查看
 */
export function formatValidationResult(result: ValidationResult): string {
  if (result.isValid && result.warnings.length === 0) {
    return '✅ 大纲验证通过，无边界冲突'
  }

  let message = ''

  if (result.errors.length > 0) {
    message += '❌ 发现以下边界问题：\n\n'
    for (const error of result.errors) {
      const icon = error.type === 'past_repeat' ? '🔙' : error.type === 'future_leak' ? '⏩' : '⚠️'
      message += `${icon} 第${error.chapterNumber}章《${error.chapterTitle}》\n`
      message += `   问题：${error.description}\n`
      if (error.conflictSource) {
        message += `   冲突来源：${error.conflictSource}\n`
      }
      message += '\n'
    }
  }

  if (result.warnings.length > 0) {
    message += '⚠️ 警告：\n'
    for (const warning of result.warnings) {
      if (warning.chapterNumber > 0) {
        message += `   - 第${warning.chapterNumber}章：${warning.description}\n`
      } else {
        message += `   - ${warning.description}\n`
      }
    }
  }

  return message
}
