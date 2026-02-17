import type { Character } from '../types'

/**
 * 角色死亡防控工具
 * 三合一方案：
 * 1. 构建已故角色列表用于提示词
 * 2. 生成后校验内容是否包含已故角色
 * 3. 分析章节检测角色死亡事件
 */

/**
 * 获取已故角色列表（用于生成前验证和提示词构建）
 */
export function getDeceasedCharacters(characters: Character[]): Character[] {
  return characters.filter(c => c.status === 'deceased')
}

/**
 * 获取存活角色列表
 */
export function getActiveCharacters(characters: Character[]): Character[] {
  return characters.filter(c => c.status !== 'deceased')
}

/**
 * 构建已故角色警告文本（用于提示词）
 * @param characters - 角色列表
 * @returns 已故角色警告文本，如果没有已故角色则返回空字符串
 */
export function buildDeceasedWarning(characters: Character[]): string {
  const deceased = getDeceasedCharacters(characters)

  if (deceased.length === 0) {
    return ''
  }

  const deceasedList = deceased.map(c => {
    let info = `- ${c.name}`
    if (c.deathChapter) {
      info += `（死于：${c.deathChapter}）`
    }
    return info
  }).join('\n')

  return `
【🚨 已故角色名单 - 绝对禁止出场】
以下角色已在之前的剧情中死亡，在后续章节中绝对不能：
1. 让他们说话或出现
2. 提及他们的现在时态活动
3. 安排他们与其他角色互动
4. 以任何形式让他们"复活"

${deceasedList}

⚠️ 可以做的：回忆/闪回、其他角色提及已故者、墓碑/遗物等
❌ 禁止的：已故角色有任何新的动作、对话、出场
`
}

/**
 * 构建角色档案简报（用于提示词，包含生死状态和关系）
 */
export function buildCharacterBriefing(characters: Character[]): string {
  const active = getActiveCharacters(characters)
  const deceased = getDeceasedCharacters(characters)

  let briefing = '【角色档案】\n\n'

  // 存活角色
  if (active.length > 0) {
    briefing += '▶ 存活角色：\n'
    briefing += active.slice(0, 8).map(c => {
      const role = c.role === 'protagonist' ? '主角' : c.role === 'antagonist' ? '反派' : '配角'
      let info = `• ${c.name}（${role}）：${c.identity}`
      if (c.relationships && c.relationships.length > 0) {
        const rels = c.relationships.slice(0, 2).map(r => `${r.targetName}:${r.relation}`).join('、')
        info += ` [关系：${rels}]`
      }
      return info
    }).join('\n')
    briefing += '\n\n'
  }

  // 已故角色
  if (deceased.length > 0) {
    briefing += '▶ 已故角色（禁止出场）：\n'
    briefing += deceased.map(c => {
      let info = `• ${c.name}（已死亡`
      if (c.deathChapter) {
        info += `于${c.deathChapter}`
      }
      info += '）'
      return info
    }).join('\n')
    briefing += '\n'
  }

  return briefing
}

/**
 * 检测文本内容中是否包含已故角色的名字
 * 用于生成后校验
 * @param content - 生成的内容
 * @param characters - 角色列表
 * @returns 检测结果
 */
export function detectDeceasedInContent(
  content: string,
  characters: Character[]
): {
  hasViolation: boolean
  violations: {
    name: string
    deathChapter?: string
    occurrences: number
    contexts: string[]  // 出现的上下文片段
  }[]
} {
  const deceased = getDeceasedCharacters(characters)
  const violations: {
    name: string
    deathChapter?: string
    occurrences: number
    contexts: string[]
  }[] = []

  for (const char of deceased) {
    // 搜索角色名出现的位置
    const regex = new RegExp(char.name, 'g')
    const matches = content.match(regex)

    if (matches && matches.length > 0) {
      // 获取出现的上下文
      const contexts: string[] = []
      let match
      const searchRegex = new RegExp(char.name, 'g')
      while ((match = searchRegex.exec(content)) !== null) {
        const start = Math.max(0, match.index - 20)
        const end = Math.min(content.length, match.index + char.name.length + 20)
        const context = content.slice(start, end)

        // 排除明显是回忆/过去式的上下文
        const isPastTense = /曾经|当年|想起|回忆|以前|从前|那时|往事|故去|已故|去世|死后/.test(context)
        if (!isPastTense) {
          contexts.push('...' + context + '...')
        }
      }

      // 如果有非回忆上下文，记录为违规
      if (contexts.length > 0) {
        violations.push({
          name: char.name,
          deathChapter: char.deathChapter,
          occurrences: contexts.length,
          contexts: contexts.slice(0, 3) // 最多显示3个上下文
        })
      }
    }
  }

  return {
    hasViolation: violations.length > 0,
    violations
  }
}

/**
 * 格式化违规检测结果为警告消息
 */
export function formatViolationWarning(
  violations: {
    name: string
    deathChapter?: string
    occurrences: number
    contexts: string[]
  }[]
): string {
  if (violations.length === 0) return ''

  let warning = '⚠️ 检测到已故角色出场：\n\n'

  for (const v of violations) {
    warning += `【${v.name}】`
    if (v.deathChapter) {
      warning += `（已故于：${v.deathChapter}）`
    }
    warning += `\n出现 ${v.occurrences} 次：\n`
    for (const ctx of v.contexts) {
      warning += `  "${ctx}"\n`
    }
    warning += '\n'
  }

  warning += '建议：请检查这些内容是否需要修改，确保已故角色不会在现在时态出场。'

  return warning
}

/**
 * 分析章节内容，检测角色死亡事件
 * 这是对gemini.ts中analyzeChapterForCharacters的补充
 * 用于本地快速检测，不调用API
 */
export function quickAnalyzeDeaths(
  content: string,
  characterNames: string[]
): {
  potentialDeaths: string[]  // 可能死亡的角色名
  confidence: 'high' | 'medium' | 'low'
} {
  const deathKeywords = [
    '死了', '死亡', '牺牲', '去世', '陨落', '身亡', '殒命',
    '断气', '咽气', '没了呼吸', '停止了呼吸', '闭上了眼睛',
    '倒在血泊', '永远地', '再也不会', '化为灰烬', '魂飞魄散',
    '灰飞烟灭', '香消玉殒', '与世长辞', '命丧', '丧命'
  ]

  const potentialDeaths: string[] = []

  for (const name of characterNames) {
    // 检查角色名是否在死亡关键词附近出现
    for (const keyword of deathKeywords) {
      // 角色名在关键词前后50字范围内
      const pattern = new RegExp(`${name}.{0,50}${keyword}|${keyword}.{0,50}${name}`)
      if (pattern.test(content)) {
        if (!potentialDeaths.includes(name)) {
          potentialDeaths.push(name)
        }
        break
      }
    }
  }

  // 根据检测到的数量判断置信度
  let confidence: 'high' | 'medium' | 'low' = 'low'
  if (potentialDeaths.length > 0) {
    // 检查是否有多个死亡关键词
    const keywordCount = deathKeywords.filter(kw => content.includes(kw)).length
    if (keywordCount >= 3) {
      confidence = 'high'
    } else if (keywordCount >= 1) {
      confidence = 'medium'
    }
  }

  return { potentialDeaths, confidence }
}

/**
 * 生成角色死亡确认提示
 * 当检测到可能的死亡事件时，生成供用户确认的消息
 */
export function buildDeathConfirmationPrompt(
  potentialDeaths: string[],
  chapterTitle: string
): string {
  if (potentialDeaths.length === 0) return ''

  return `📝 在「${chapterTitle}」中检测到可能的角色死亡事件：

${potentialDeaths.map(name => `• ${name}`).join('\n')}

是否将这些角色标记为已故？
（标记后，AI写作时将自动避免让他们出场）`
}

/**
 * 检测正文中出现的角色
 * 用于自动更新角色状态从 pending 到 active
 * @param content - 章节正文内容
 * @param characters - 角色列表
 * @returns 出现的角色ID列表
 */
export function detectCharacterAppearances(
  content: string,
  characters: Character[]
): {
  appearedCharacterIds: string[]  // 在正文中出现的角色ID
  pendingToActive: string[]        // 需要从pending更新为active的角色ID
} {
  const appearedCharacterIds: string[] = []
  const pendingToActive: string[] = []

  // 移除HTML标签，获取纯文本
  const plainText = content.replace(/<[^>]*>/g, '')

  for (const char of characters) {
    // 检查角色名是否在正文中出现
    if (plainText.includes(char.name)) {
      appearedCharacterIds.push(char.id)

      // 如果角色状态是pending，标记需要更新
      if (char.status === 'pending') {
        pendingToActive.push(char.id)
      }
    }
  }

  return { appearedCharacterIds, pendingToActive }
}

/**
 * 批量检测所有章节中的角色出场情况
 * 用于修复历史数据
 * @param chaptersContent - 所有章节的正文内容数组
 * @param characters - 角色列表
 * @returns 每个角色的出场统计
 */
export function analyzeAllChapterAppearances(
  chaptersContent: string[],
  characters: Character[]
): {
  characterId: string
  characterName: string
  currentStatus: string
  appearanceCount: number
  shouldBeActive: boolean
}[] {
  const results: {
    characterId: string
    characterName: string
    currentStatus: string
    appearanceCount: number
    shouldBeActive: boolean
  }[] = []

  // 合并所有章节内容用于检测
  const allContent = chaptersContent.join('\n').replace(/<[^>]*>/g, '')

  for (const char of characters) {
    // 计算出现次数
    const regex = new RegExp(char.name, 'g')
    const matches = allContent.match(regex)
    const count = matches ? matches.length : 0

    results.push({
      characterId: char.id,
      characterName: char.name,
      currentStatus: char.status,
      appearanceCount: count,
      // 出现过且状态为pending的角色应该更新为active
      shouldBeActive: count > 0 && char.status === 'pending'
    })
  }

  return results
}

/**
 * 从正文中提取可能的新角色名字
 * 使用简单的启发式方法检测人名
 * @param content - 章节正文内容
 * @param existingNames - 已有角色名列表（排除）
 * @returns 可能的新角色名列表
 */
export function extractPotentialNewCharacters(
  content: string,
  existingNames: string[]
): string[] {
  const plainText = content.replace(/<[^>]*>/g, '')
  const potentialNames: Set<string> = new Set()

  // 模式1：对话引导词 - "XXX说"、"XXX道"、"XXX问" 等
  const dialoguePatterns = [
    /["「『].*?["」』].*?([^，。！？、\s]{2,4})(说|道|问|答|喊|叫|笑|怒|叹)/g,
    /([^，。！？、\s]{2,4})(说|道|问|答|喊|叫|笑道|冷笑|大喊|低声)[:：]?\s*["「『]/g
  ]

  for (const pattern of dialoguePatterns) {
    let match
    while ((match = pattern.exec(plainText)) !== null) {
      const name = match[1]
      if (name && isValidChineseName(name)) {
        potentialNames.add(name)
      }
    }
  }

  // 模式2：动作描述 - "XXX转身"、"XXX走了过来" 等
  const actionPatterns = [
    /([^，。！？、\s]{2,4})(转身|走|跑|站|坐|躺|跪|跳|冲|挥|举|拿|放|看|望|听|想|觉得)/g
  ]

  for (const pattern of actionPatterns) {
    let match
    while ((match = pattern.exec(plainText)) !== null) {
      const name = match[1]
      if (name && isValidChineseName(name)) {
        potentialNames.add(name)
      }
    }
  }

  // 模式3：称呼模式 - "这位XXX"、"那个XXX"
  const titlePatterns = [
    /(这位|那位|那个|这个)([^，。！？、\s]{2,4})/g
  ]

  for (const pattern of titlePatterns) {
    let match
    while ((match = pattern.exec(plainText)) !== null) {
      const name = match[2]
      if (name && isValidChineseName(name)) {
        potentialNames.add(name)
      }
    }
  }

  // 排除已有角色
  const existingSet = new Set(existingNames)
  const newNames = Array.from(potentialNames).filter(name => !existingSet.has(name))

  // 排除常见的非人名词汇
  const excludeWords = [
    '自己', '对方', '众人', '大家', '所有', '一切', '这里', '那里',
    '此时', '当时', '这时', '那时', '之后', '之前', '突然', '居然',
    '竟然', '果然', '虽然', '当然', '显然', '必然', '偶然', '忽然',
    '仿佛', '似乎', '好像', '看来', '想来', '说来', '听来',
    '少年', '青年', '老人', '女子', '男子', '少女', '老者'
  ]

  return newNames.filter(name => !excludeWords.includes(name))
}

/**
 * 简单的中文人名验证
 */
function isValidChineseName(name: string): boolean {
  // 2-4个汉字
  if (!/^[\u4e00-\u9fa5]{2,4}$/.test(name)) {
    return false
  }

  // 排除常见的非人名开头
  const invalidStarts = ['一个', '那个', '这个', '什么', '为什', '怎么', '如何', '如果', '虽然', '但是', '因为', '所以']
  for (const start of invalidStarts) {
    if (name.startsWith(start.slice(0, 2))) {
      return false
    }
  }

  return true
}

/**
 * 格式化角色出场更新提示
 */
export function formatAppearanceUpdateMessage(
  updatedNames: string[]
): string {
  if (updatedNames.length === 0) return ''

  return `✅ 已自动更新 ${updatedNames.length} 个角色状态为"活跃"：${updatedNames.join('、')}`
}
