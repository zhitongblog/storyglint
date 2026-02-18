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
 * 改进：提取完整的事件描述而不是单个词，保留上下文
 * 新增：区分"核心事件"和"起始事件"
 */
export function extractKeyEvents(
  volumeSummary: string,
  keyEvents?: string[],
  mainPlot?: string,
  volumeTitle?: string
): string[] {
  const events: string[] = []

  // 1. 从明确的关键事件中提取（优先级最高）
  if (keyEvents && keyEvents.length > 0) {
    events.push(...keyEvents)
  }

  // 2. 从主线剧情中提取完整事件短语
  if (mainPlot) {
    // 按句号、分号分割成子句，每个子句可能是一个事件
    const clauses = mainPlot.split(/[。；;]/).filter(c => c.trim().length > 5)
    for (const clause of clauses) {
      const trimmed = clause.trim()
      // 过滤掉纯描述性的短语，保留有动作的
      if (trimmed.length > 5 && trimmed.length < 50) {
        events.push(trimmed)
      }
    }
  }

  // 3. 从卷摘要中提取关键事件短语
  if (volumeSummary && events.length < 3) {
    // 按标点分割成子句
    const clauses = volumeSummary.split(/[，。！？、；]/).filter(c => c.trim().length > 4)

    // 关键动作词列表（按重要性排序）
    const actionKeywords = [
      // 战斗/消灭类（高优先）
      '击败', '战胜', '打败', '消灭', '杀死', '斩杀', '覆灭', '击杀',
      // 成长/获得类（高优先）
      '突破', '晋级', '进阶', '觉醒', '获得', '得到', '习得', '领悟',
      // 发现/揭露类
      '发现', '揭露', '揭开', '知道', '了解', '真相', '秘密',
      // 关系变化类
      '结盟', '联合', '背叛', '反目', '决裂', '相遇', '重逢',
      // 位置变化类（可能是下一卷的开始）
      '逃离', '离开', '进入', '到达', '返回', '前往', '踏入', '闯入',
      // 事件类
      '比赛', '大赛', '考核', '试炼', '挑战', '参加', '开始', '爆发',
      // 生死类
      '死亡', '牺牲', '陨落', '复活', '苏醒', '重生'
    ]

    for (const clause of clauses) {
      const trimmed = clause.trim()
      // 检查是否包含关键动作词
      const hasAction = actionKeywords.some(kw => trimmed.includes(kw))
      if (hasAction && trimmed.length >= 4 && trimmed.length < 40) {
        events.push(trimmed)
      }
    }
  }

  // 4. 如果有卷名，尝试从卷名中提取核心主题
  if (volumeTitle && events.length < 2) {
    // 卷名通常是本卷的核心主题，也是重要的边界标识
    events.push(`【本卷主题】${volumeTitle}`)
  }

  // 去重并限制数量（最多6个）
  const uniqueEvents = [...new Set(events)]
  return uniqueEvents.slice(0, 6)
}

/**
 * 提取卷的"起始事件"（用于标识下一卷不能提前写的内容）
 * 起始事件通常是：到达新地点、开始新任务、触发新冲突等
 */
export function extractStartingEvents(
  volumeSummary: string,
  volumeTitle?: string,
  keyEvents?: string[]
): string[] {
  const startingEvents: string[] = []

  // 起始动作词（这些词通常标志着新阶段的开始）
  const startingKeywords = [
    '进入', '踏入', '来到', '到达', '前往', '闯入',  // 位置变化
    '开始', '开启', '踏上', '启程', '出发',  // 新旅程
    '参加', '加入', '报名', '接受',  // 新任务
    '遇到', '相遇', '邂逅',  // 新角色
    '爆发', '触发', '引发'  // 新冲突
  ]

  // 从卷摘要中提取起始事件
  if (volumeSummary) {
    const clauses = volumeSummary.split(/[，。！？、；]/).filter(c => c.trim().length > 3)
    for (const clause of clauses) {
      const trimmed = clause.trim()
      const hasStarting = startingKeywords.some(kw => trimmed.includes(kw))
      if (hasStarting && trimmed.length >= 4 && trimmed.length < 50) {
        startingEvents.push(trimmed)
      }
    }
  }

  // 从卷名中提取（卷名通常暗示本卷的核心场景/任务）
  if (volumeTitle) {
    startingEvents.push(`进入/开始"${volumeTitle}"阶段`)
  }

  // 从关键事件中提取起始类事件
  if (keyEvents && keyEvents.length > 0) {
    for (const event of keyEvents) {
      const hasStarting = startingKeywords.some(kw => event.includes(kw))
      if (hasStarting) {
        startingEvents.push(event)
      }
    }
  }

  return [...new Set(startingEvents)].slice(0, 4)
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

  // 本卷必须完成的事件（优先使用 keyEvents，其次 keyPoints，最后从摘要提取）
  if (currentVolume.keyEvents && currentVolume.keyEvents.length > 0) {
    boundary.mustCompleteEvents = [...currentVolume.keyEvents]
  } else if (currentVolume.keyPoints && currentVolume.keyPoints.length > 0) {
    boundary.mustCompleteEvents = [...currentVolume.keyPoints]
  } else {
    boundary.mustCompleteEvents = extractKeyEvents(
      currentVolume.summary,
      undefined,
      currentVolume.mainPlot,
      currentVolume.title
    )
  }

  // 上一卷已完成的事件（不可重复）
  if (previousVolume) {
    if (previousVolume.keyEvents && previousVolume.keyEvents.length > 0) {
      boundary.completedEvents = [...previousVolume.keyEvents]
    } else if (previousVolume.keyPoints && previousVolume.keyPoints.length > 0) {
      boundary.completedEvents = [...previousVolume.keyPoints]
    } else {
      boundary.completedEvents = extractKeyEvents(
        previousVolume.summary,
        undefined,
        previousVolume.mainPlot,
        previousVolume.title
      )
    }
    boundary.startingState = `承接《${previousVolume.title}》结尾，本卷从这里开始`
  }

  // 下一卷的事件（不可提前写）- 这是最重要的边界约束
  if (nextVolume) {
    // 1. 提取下一卷的关键事件
    let nextVolumeEvents: string[] = []
    if (nextVolume.keyEvents && nextVolume.keyEvents.length > 0) {
      nextVolumeEvents = [...nextVolume.keyEvents]
    } else if (nextVolume.keyPoints && nextVolume.keyPoints.length > 0) {
      nextVolumeEvents = [...nextVolume.keyPoints]
    } else {
      nextVolumeEvents = extractKeyEvents(
        nextVolume.summary,
        undefined,
        nextVolume.mainPlot,
        nextVolume.title
      )
    }

    // 2. 提取下一卷的"起始事件"（这是本卷绝对不能写的）
    const nextVolumeStartingEvents = extractStartingEvents(
      nextVolume.summary,
      nextVolume.title,
      nextVolume.keyEvents
    )

    // 3. 合并禁止事件列表（起始事件优先级更高）
    boundary.forbiddenEvents = [
      ...nextVolumeStartingEvents,
      ...nextVolumeEvents.filter(e => !nextVolumeStartingEvents.includes(e))
    ].slice(0, 8)  // 限制数量避免token过多

    // 4. 设置本卷结束状态
    boundary.endingState = `本卷在"${currentVolume.title}"范围内结束，为《${nextVolume.title}》做铺垫，但不能开始《${nextVolume.title}》的任何剧情`
  } else {
    // 最后一卷
    boundary.endingState = `本卷完成"${currentVolume.title}"的主线，为全书结局做铺垫`
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
 * 改进：提高阈值，区分核心动作词和普通词
 */
function containsForbiddenEvent(outline: string, forbiddenEvents: string[]): string | null {
  const outlineLower = outline.toLowerCase()

  // 核心动作词列表（这些词匹配时权重更高）
  const coreActionWords = new Set([
    '击败', '战胜', '打败', '消灭', '杀死', '斩杀', '覆灭',
    '突破', '晋级', '进阶', '觉醒', '获得', '得到', '习得',
    '发现', '揭露', '揭开', '真相',
    '结盟', '联合', '背叛', '反目', '决裂',
    '逃离', '离开', '进入', '到达', '返回',
    '比赛', '大赛', '考核', '试炼', '挑战',
    '死亡', '牺牲', '陨落', '复活', '苏醒', '重生'
  ])

  for (const event of forbiddenEvents) {
    // 关键词匹配
    const keywords = event.split(/[，。、\s]+/).filter(w => w.length > 1)
    if (keywords.length === 0) continue

    let matchCount = 0
    let coreWordMatched = false

    for (const keyword of keywords) {
      const keywordLower = keyword.toLowerCase()
      if (outlineLower.includes(keywordLower)) {
        matchCount++
        // 检查是否匹配到了核心动作词
        if (coreActionWords.has(keyword)) {
          coreWordMatched = true
        }
      }
    }

    const matchRatio = matchCount / keywords.length

    // 匹配条件：
    // 1. 短事件（<=3词）：需要 100% 匹配
    // 2. 中等事件（4-6词）：需要 75% 匹配 + 核心词匹配
    // 3. 长事件（>6词）：需要 70% 匹配 + 核心词匹配
    if (keywords.length <= 3) {
      if (matchRatio >= 1.0) {
        return event
      }
    } else if (keywords.length <= 6) {
      if (matchRatio >= 0.75 && coreWordMatched) {
        return event
      }
    } else {
      if (matchRatio >= 0.7 && coreWordMatched) {
        return event
      }
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
  prompt += '\n\n╔══════════════════════════════════════════════════════════════╗\n'
  prompt += '║              【🚨🚨🚨 内容边界强制约束 🚨🚨🚨】                ║\n'
  prompt += '║     违反以下约束的大纲将被系统自动拒绝，请务必严格遵守！       ║\n'
  prompt += '╚══════════════════════════════════════════════════════════════╝\n\n'

  // 本卷任务（放在最前面，让AI先明确目标）
  if (boundary.mustCompleteEvents.length > 0) {
    prompt += '🟢【本卷核心任务 - 必须聚焦】\n'
    prompt += '   本卷的全部内容必须围绕以下事件展开：\n'
    boundary.mustCompleteEvents.forEach((event, i) => {
      prompt += `   ${i + 1}. ✅ ${event}\n`
    })
    prompt += '   ⚠️ 这些是本卷的唯一主线，所有章节都必须为这些事件服务！\n\n'
  }

  // 禁止区域 - 过去的内容
  if (boundary.completedEvents.length > 0) {
    prompt += '🔴【禁区一：上一卷已完成 - 严禁重复】\n'
    prompt += '   以下事件已在上一卷完成，本卷绝对不能再写：\n'
    boundary.completedEvents.forEach((event, i) => {
      prompt += `   ${i + 1}. ❌ ${event}\n`
    })
    prompt += '   → 这些是历史，不可改变，不可重演，甚至不要提及\n\n'
  }

  // 禁止区域 - 未来的内容（最重要的约束）
  if (boundary.forbiddenEvents.length > 0) {
    prompt += '🔴🔴🔴【禁区二：下一卷内容 - 绝对禁止提前写】🔴🔴🔴\n'
    prompt += '   以下是下一卷的核心内容，本卷严禁出现：\n'
    boundary.forbiddenEvents.forEach((event, i) => {
      prompt += `   ${i + 1}. ⛔⛔ ${event} ⛔⛔\n`
    })
    prompt += '\n'
    prompt += '   ❌ 绝对禁止：\n'
    prompt += '   • 不能写出下一卷的任何核心事件\n'
    prompt += '   • 不能让主角提前到达下一卷的起点\n'
    prompt += '   • 不能在本卷解决属于下一卷的冲突\n'
    prompt += '   • 不能提前揭示属于下一卷的秘密\n'
    prompt += '   • 本卷最后几章只能"铺垫"和"暗示"，绝不能"开始"下一卷\n'
    prompt += '\n'
    prompt += '   ✅ 正确做法：\n'
    prompt += '   • 本卷结尾留下悬念，引向下一卷\n'
    prompt += '   • 可以埋伏笔，但不能揭示\n'
    prompt += '   • 可以暗示危机，但不能触发\n'
    prompt += '   • 本卷的高潮是本卷任务的完成，不是下一卷的开始\n\n'
  }

  // 边界状态
  prompt += '📍【本卷边界状态】\n'
  if (boundary.startingState) {
    prompt += `   起点：${boundary.startingState}\n`
  }
  if (boundary.endingState) {
    prompt += `   终点：${boundary.endingState}\n`
  }
  prompt += '   ⚠️ 本卷结束时，主角应该完成本卷任务，但尚未开始下一卷的旅程！\n\n'

  // 章节分布指引
  prompt += '📊【章节进度规划 - 重要】\n'
  prompt += '   请按以下比例规划本卷章节（以40章为例）：\n'
  prompt += '   • 第1-4章（10%）：开篇，建立本卷起点，承接上一卷\n'
  prompt += '   • 第5-16章（30%）：发展，展开本卷主线冲突\n'
  prompt += '   • 第17-32章（40%）：高潮，本卷核心事件的爆发与解决\n'
  prompt += '   • 第33-40章（20%）：收尾，总结本卷，为下一卷埋伏笔（但不开始！）\n'
  prompt += '\n'
  prompt += '   🚫 常见错误：\n'
  prompt += '   • 在第30章就开始写下一卷的内容 → 错误！\n'
  prompt += '   • 本卷最后几章主角已经进入下一卷的场景 → 错误！\n'
  prompt += '   • 本卷结尾主角已经开始下一卷的任务 → 错误！\n\n'

  prompt += '⚠️⚠️⚠️ 每一章大纲都会被系统自动检测，违反边界约束将被标记为错误！⚠️⚠️⚠️\n'

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
