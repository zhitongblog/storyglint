import { generateText } from './gemini'
import type { Character, Volume, Chapter } from '../types'
import { buildCompressedContext } from './outline-optimizer'
import {
  buildVolumeBoundary,
  buildBoundaryConstraintPrompt,
  validateGeneratedOutlines,
  formatValidationResult,
  type ValidationResult
} from './outline-validator'

interface AutoCreateResult {
  worldSetting: string
  characters: Partial<Character>[]
  volumes: {
    title: string
    summary: string
    chapters: { title: string; outline: string }[]
  }[]
}

interface ProgressCallback {
  (phase: string, progress: number, message: string): void
}

/**
 * 全自动创作 - 根据灵感生成完整的小说框架
 */
export async function autoCreateNovel(
  inspiration: string,
  constraints: string,
  scale: string,
  genres: string[],
  styles: string[],
  onProgress?: ProgressCallback
): Promise<AutoCreateResult> {
  const scaleConfig = getScaleConfig(scale)
  const isMillion = scale === 'million'

  if (isMillion) {
    // 百万巨著：分步生成
    return generateMillionNovel(inspiration, constraints, scaleConfig, genres, styles, onProgress)
  } else {
    // 微小说：一次性生成
    return generateMicroNovel(inspiration, constraints, scaleConfig, genres, styles)
  }
}

/**
 * 生成微小说（一次性生成）
 */
async function generateMicroNovel(
  inspiration: string,
  constraints: string,
  scaleConfig: ReturnType<typeof getScaleConfig>,
  genres: string[],
  styles: string[]
): Promise<AutoCreateResult> {
  const frameworkPrompt = buildMicroNovelPrompt(inspiration, constraints, scaleConfig, genres, styles)
  const frameworkResponse = await generateText(frameworkPrompt)
  return parseFrameworkResponse(frameworkResponse)
}

/**
 * 生成百万巨著（只生成框架，不生成章节大纲）
 * 章节大纲改为在大纲页面按卷手动触发生成
 */
async function generateMillionNovel(
  inspiration: string,
  constraints: string,
  scaleConfig: ReturnType<typeof getScaleConfig>,
  genres: string[],
  styles: string[],
  onProgress?: ProgressCallback
): Promise<AutoCreateResult> {
  // 只生成世界观、角色和卷结构（不生成章节）
  onProgress?.('framework', 20, '正在构建世界观和角色...')

  const frameworkPrompt = buildMillionFrameworkPrompt(inspiration, constraints, scaleConfig, genres, styles)
  const frameworkResponse = await generateText(frameworkPrompt)
  const framework = parseMillionFramework(frameworkResponse)

  onProgress?.('framework', 80, '正在整理分卷结构...')

  // 只返回卷结构，不含章节
  const volumes: AutoCreateResult['volumes'] = framework.volumes.map(vol => ({
    title: vol.title,
    summary: vol.summary,
    chapters: []  // 不生成章节，留待手动触发
  }))

  onProgress?.('complete', 95, '框架生成完成（请在大纲页面生成各卷章节）')

  return {
    worldSetting: framework.worldSetting,
    characters: framework.characters,
    volumes: volumes
  }
}

/**
 * 获取创作规模配置
 */
function getScaleConfig(scale: string) {
  const configs: Record<string, {
    wordCount: string
    volumeCount: string
    chaptersPerVolume: string
    description: string
  }> = {
    micro: {
      wordCount: '约2万字（8章 × 2500字）',
      volumeCount: '1卷',
      chaptersPerVolume: '8章以内',
      description: '微小说，快节奏，情节紧凑，每章2500字左右'
    },
    million: {
      wordCount: '120万字以上（12卷 × 40章 × 2500字）',
      volumeCount: '至少12卷',
      chaptersPerVolume: '每卷至少40章',
      description: '百万巨著，宏大世界观，多条故事线，每章至少2500字'
    }
  }
  return configs[scale] || configs.million
}

/**
 * 构建微小说提示词（一次性生成）
 */
function buildMicroNovelPrompt(
  inspiration: string,
  constraints: string,
  scaleConfig: ReturnType<typeof getScaleConfig>,
  genres: string[],
  styles: string[]
): string {
  return `你是一个顶级的网文主编兼金牌编剧，精通番茄、起点等平台的市场风向。

请根据以下灵感，生成完整的微小说创作框架。

【核心灵感】
${inspiration}

【额外约束】
${constraints || '无特殊约束'}

【创作规模】
- 这是一部微小说
- 目标字数：${scaleConfig.wordCount}
- 只有1卷，最多8章
- 每章2500字左右

【题材标签】
${genres.join('、') || '未指定'}

【写作风格】
${styles.join('、') || '未指定'}

请严格按照以下 JSON 格式返回（不要包含任何其他文字，只返回纯 JSON）：

{
  "worldSetting": "详细的世界观设定，至少300字",
  "characters": [
    {
      "name": "角色名",
      "role": "protagonist/supporting/antagonist",
      "gender": "男/女",
      "age": "年龄描述",
      "identity": "身份职业",
      "description": "详细的角色设定，至少100字",
      "arc": "人物成长弧线"
    }
  ],
  "volumes": [
    {
      "title": "卷名（10字内，无编号）",
      "summary": "核心剧情，50-80字，简洁直接",
      "chapters": [
        {
          "title": "标题（10字内，无编号）",
          "outline": "简洁大纲，50-80字：场景+冲突+悬念"
        }
      ]
    }
  ]
}

要求：
1. 角色至少包含1个主角、1-2个配角
2. 只生成1卷，5-8章
3. 情节紧凑，快节奏
4. 每章结尾要有悬念
5. 标题和大纲都要简洁，无废话，直击要点

只返回 JSON，不要有任何解释文字。`
}

/**
 * 构建百万巨著框架提示词（只生成世界观、角色、卷结构）
 */
function buildMillionFrameworkPrompt(
  inspiration: string,
  constraints: string,
  scaleConfig: ReturnType<typeof getScaleConfig>,
  genres: string[],
  styles: string[]
): string {
  return `你是一个顶级的网文主编兼金牌编剧，精通番茄、起点等平台的市场风向。

请根据以下灵感，生成百万巨著的整体框架（世界观、角色、分卷结构）。

【核心灵感】
${inspiration}

【额外约束】
${constraints || '无特殊约束'}

【创作规模】
- 这是一部百万字级别的长篇巨著
- 目标字数：${scaleConfig.wordCount}
- 必须规划至少12卷
- 每卷后续会生成40+章节

【题材标签】
${genres.join('、') || '未指定'}

【写作风格】
${styles.join('、') || '未指定'}

请严格按照以下 JSON 格式返回（不要包含任何其他文字，只返回纯 JSON）：

{
  "worldSetting": "详细的世界观设定，包括时代背景、地理环境、社会结构、力量体系/修炼等级（如有）、特殊规则等，至少800字",
  "characters": [
    {
      "name": "角色名",
      "role": "protagonist/supporting/antagonist",
      "gender": "男/女",
      "age": "年龄描述",
      "identity": "身份职业",
      "description": "详细的角色设定，包括外貌、性格、背景、动机等，至少200字",
      "arc": "人物成长弧线"
    }
  ],
  "volumes": [
    {
      "title": "卷名（10字以内，不要编号）",
      "summary": "本卷核心剧情，50-80字，简洁明了，直击要点，无废话",
      "mainPlot": "本卷主线剧情（一句话）",
      "keyEvents": ["关键事件1", "关键事件2", "关键事件3"]
    }
  ]
}

【重要要求】：
1. 角色至少包含1个主角、4-6个重要配角、2-3个反派
2. 必须生成至少12卷的volumes数组
3. 每卷的summary必须简洁，50-80字，直击核心冲突，无铺垫废话
4. 卷标题不要编号（不要"第一卷 XXX"），直接写卷名，10字以内
5. 整体剧情要有明确的"爽点循环"设计
6. 卷与卷之间要有承接和递进
7. 世界观要宏大且有特色
8. 人物要立体，有清晰的成长弧光

只返回 JSON，不要有任何解释文字。`
}

/**
 * 角色档案信息（用于生成章节大纲时参考）
 */
interface CharacterArchive {
  name: string
  role: string
  identity: string
  status: string
  deathChapter?: string
  appearances: string[]
  relationships: { targetName: string; relation: string }[]
}

/**
 * 构建单卷章节大纲提示词（包含完整角色档案）
 */
function buildVolumeChaptersPrompt(
  worldSetting: string,
  characters: Partial<Character>[],
  volume: { title: string; summary: string; mainPlot?: string; keyEvents?: string[] },
  volumeIndex: number,
  totalVolumes: number,
  genres: string[],
  styles: string[],
  chapterCount: number = 40,
  startChapterNumber: number = 1,
  guidance: string = '',
  characterArchives?: CharacterArchive[],
  contextInfo?: {
    previousVolumeChapters?: string[]
    previousVolumeSummary?: string  // 上一卷的完整摘要
    nextVolumeSummary?: string
    nextVolumeDetails?: {  // 下一卷的详细信息
      title: string
      summary: string
      mainPlot?: string
      keyEvents?: string[]
    }
    writtenChaptersSummary?: string[]
    existingChapterOutlines?: string[]  // 已有章节大纲列表
    volumeIndex?: string  // 全书卷索引（压缩模式）
    boundaryConstraint?: string  // 边界约束提示词（新增）
  }
): string {
  // 构建角色档案信息（包含关系、状态等）
  let characterInfo: string
  let deceasedWarning: string = ''

  if (characterArchives && characterArchives.length > 0) {
    // 分离存活和已故角色
    const activeArchives = characterArchives.filter(c => c.status !== 'deceased')
    const deceasedArchives = characterArchives.filter(c => c.status === 'deceased')

    // 存活角色信息
    characterInfo = activeArchives.slice(0, 8).map(c => {
      let info = `${c.name}(${c.role}): ${c.identity}`
      if (c.relationships && c.relationships.length > 0) {
        const rels = c.relationships.slice(0, 3).map(r => `${r.targetName}:${r.relation}`).join('、')
        info += ` 【关系：${rels}】`
      }
      return info
    }).join('\n')

    // 构建已故角色警告
    if (deceasedArchives.length > 0) {
      deceasedWarning = '\n\n【🚨 已故角色 - 禁止安排出场】\n'
      deceasedWarning += deceasedArchives.map(c => {
        let info = `• ${c.name}`
        if (c.deathChapter) {
          info += `（死于：${c.deathChapter}）`
        }
        return info
      }).join('\n')
      deceasedWarning += '\n⚠️ 大纲中不要安排已故角色有任何活动或对话！'
    }
  } else {
    // 使用基础角色信息
    const activeChars = characters.filter(c => c.status !== 'deceased')
    const deceasedChars = characters.filter(c => c.status === 'deceased')

    characterInfo = activeChars
      .slice(0, 5)
      .map(c => `${c.name}(${c.role}): ${c.identity}`)
      .join('\n')

    if (deceasedChars.length > 0) {
      deceasedWarning = '\n\n【🚨 已故角色 - 禁止安排出场】\n'
      deceasedWarning += deceasedChars.map(c => {
        let info = `• ${c.name}`
        if (c.deathChapter) {
          info += `（死于：${c.deathChapter}）`
        }
        return info
      }).join('\n')
      deceasedWarning += '\n⚠️ 大纲中不要安排已故角色有任何活动或对话！'
    }
  }

  const endChapterNumber = startChapterNumber + chapterCount - 1

  const guidanceSection = guidance.trim()
    ? `\n【重要指导意见】\n${guidance.trim()}\n请务必根据以上指导意见调整章节大纲！\n`
    : ''

  // 构建上下文信息
  let contextSection = ''

  if (contextInfo) {
    // ========== 全书索引（压缩模式）==========
    if (contextInfo.volumeIndex) {
      contextSection += `\n【📚 全书结构索引】（12卷的核心要点，快速了解全书布局）\n`
      contextSection += contextInfo.volumeIndex
      contextSection += '\n'
    }

    // ========== 卷边界约束 ==========
    // 上一卷的信息（已完成的内容，不可重复）
    if (contextInfo.previousVolumeSummary && contextInfo.previousVolumeSummary.trim()) {
      contextSection += `\n【⛔ 上一卷已完成内容】（第${volumeIndex}卷，已完成，不可重复）\n`
      contextSection += contextInfo.previousVolumeSummary
      contextSection += '\n'

      // 如果有上一卷的最后几章
      if (contextInfo.previousVolumeChapters && contextInfo.previousVolumeChapters.length > 0) {
        contextSection += `\n上一卷结尾章节（最后几章）：\n`
        contextSection += contextInfo.previousVolumeChapters.join('\n')
        contextSection += '\n'
      }

      contextSection += '🚫 严格禁止：\n'
      contextSection += `- 不得重复上一卷（第${volumeIndex}卷）已完成的剧情、冲突、场景\n`
      contextSection += `- 上一卷的核心事件已经结束，本卷必须开启新的故事线\n`
      contextSection += `- 可以承接上一卷的结果，但不能重新讲述上一卷的内容\n`
    }

    // 下一卷的信息（未来的内容，不可提前写）
    if (contextInfo.nextVolumeDetails) {
      const next = contextInfo.nextVolumeDetails
      contextSection += `\n【⛔ 下一卷内容预告】（第${volumeIndex + 2}卷，属于未来，不可提前写）\n`
      contextSection += `卷名：${next.title}\n`
      contextSection += `剧情：${next.summary}\n`
      if (next.mainPlot) {
        contextSection += `主线：${next.mainPlot}\n`
      }
      if (next.keyEvents && next.keyEvents.length > 0) {
        contextSection += `关键事件：${next.keyEvents.join('、')}\n`
      }
      contextSection += '\n🚫 严格禁止：\n'
      contextSection += `- 不得提前写下一卷（第${volumeIndex + 2}卷）的内容\n`
      contextSection += `- 下一卷的关键事件、冲突、转折不能在本卷出现\n`
      contextSection += `- 本卷只能为下一卷埋伏笔，不能直接写出下一卷的剧情\n`
    } else if (contextInfo.nextVolumeSummary && contextInfo.nextVolumeSummary.trim()) {
      // 兼容旧的 nextVolumeSummary
      contextSection += `\n【⛔ 下一卷内容预告】（第${volumeIndex + 2}卷，属于未来，不可提前写）\n`
      contextSection += contextInfo.nextVolumeSummary
      contextSection += '\n🚫 严格禁止：下一卷的内容不要在本卷中提前写出！\n'
    }

    contextSection += `\n【✅ 当前卷任务】（第${volumeIndex + 1}卷，这是你要生成的）\n`
    contextSection += `- 只关注本卷的剧情和冲突\n`
    contextSection += `- 不重复上一卷，不提前写下一卷\n`
    contextSection += `- 本卷的边界：从第${startChapterNumber}章到第${endChapterNumber}章\n`

    // 本卷已有章节大纲列表（追加生成时显示）
    if (contextInfo.existingChapterOutlines && contextInfo.existingChapterOutlines.length > 0) {
      contextSection += `\n【本卷已有章节大纲】（共${contextInfo.existingChapterOutlines.length}章，追加生成必须承接）\n`
      // 只显示最后5章，避免token过多
      const recentOutlines = contextInfo.existingChapterOutlines.slice(-5)
      contextSection += recentOutlines.join('\n')
      contextSection += '\n⚠️ 新生成的章节必须从第${contextInfo.existingChapterOutlines.length + 1}章开始，承接上述最后一章的剧情\n'
    }

    // 本卷已写内容摘要
    if (contextInfo.writtenChaptersSummary && contextInfo.writtenChaptersSummary.length > 0) {
      contextSection += `\n【本卷已写正文内容】（部分章节已写正文，必须衔接）\n`
      contextSection += contextInfo.writtenChaptersSummary.join('\n')
      contextSection += '\n'
      contextSection += '🚫 严禁重复：\n'
      contextSection += '- 不可重复已写的情节、对话、场景\n'
      contextSection += '- 必须从上述内容之后继续推进剧情\n'
      contextSection += '- 新章节起点 = 已写内容的终点\n'
    }

    // 添加强化边界约束
    if (contextInfo.boundaryConstraint) {
      contextSection += contextInfo.boundaryConstraint
    }
  }

  return `你是一个顶级的网文主编兼金牌编剧。

请为以下卷生成详细的章节大纲。

【世界观概要】
${worldSetting.slice(0, 800)}

【角色档案】
${characterInfo}${deceasedWarning}

【当前卷信息】
- 卷号：第${volumeIndex}卷（共${totalVolumes}卷）
- 卷名：${volume.title}
- 剧情概述：${volume.summary}
${volume.mainPlot ? `- 主线剧情：${volume.mainPlot}` : ''}
${volume.keyEvents ? `- 关键事件：${volume.keyEvents.join('、')}` : ''}
${contextSection}
${guidanceSection}
【题材】${genres.join('、') || '未指定'}
【风格】${styles.join('、') || '未指定'}

请生成本卷的章节大纲，要求：
1. 必须生成恰好 ${chapterCount} 章
2. 章节编号从 ${startChapterNumber} 开始，到 ${endChapterNumber} 结束
3. 🔥【字数限制】标题+简介总共不超过60字：
   - 标题：最多8字，无编号（不要"第X章"），直接写标题，吸引眼球
   - 简介：40-50字，极度精简，只写核心：场景+冲突+悬念
4. 每章结尾必须有悬念或钩子
5. 有明确的"爽点循环"设计（每3-5章一个小高潮）
6. 章节之间要有逻辑连贯性
7. 注意角色的生死状态和人物关系，已故角色不应再出场

🔴【内容冲突防范 - 极其重要】：
8. 📚【参考所有卷】已提供全书结构索引，必须了解全书布局，确保本卷剧情在整体中的定位准确
9. ⛔【不可重复上一卷】如果提供了"上一卷已完成内容"和上一卷所有章节简介，这些剧情、冲突、场景已经在上一卷完成。本卷必须开启新的故事线，严禁重复上一卷的任何核心事件、场景、冲突
10. ⛔【不可提前写下一卷】如果提供了"下一卷内容预告"，这些剧情、事件属于下一卷。本卷不得涉及下一卷的关键事件、冲突、转折，只能埋伏笔
11. 🚫【不可重复本卷已写】如果提供了"本卷已写内容"，新章节必须从已写内容的结尾继续，绝不可重复已发生的情节、对话或场景
12. ✅【专注当前卷任务】本卷（第${volumeIndex + 1}卷）有自己独立的剧情使命（见"当前卷信息"），必须聚焦本卷的核心矛盾和故事弧，不越界、不重复

请严格按照以下 JSON 格式返回（只返回纯 JSON）：

{
  "chapters": [
    {
      "chapterNumber": ${startChapterNumber},
      "title": "标题（8字内，无编号）",
      "outline": "简洁大纲，40-50字：场景+冲突+悬念（标题+大纲总共不超过60字）"
    }
  ]
}

【重要】必须生成 ${chapterCount} 章，编号从 ${startChapterNumber} 到 ${endChapterNumber}！

只返回 JSON，不要有任何解释文字。`
}

/**
 * 为单卷生成章节大纲（供外部调用）
 * @param startChapterNumber - 起始章节编号，用于追加生成时
 * @param guidance - 用户指导意见，用于调整生成方向
 * @param characterArchives - 完整角色档案（包含关系、生死状态等）
 * @param useCompression - 是否使用智能压缩（节约60% token，推荐百万巨著使用）
 * @param allVolumes - 所有卷信息（启用压缩时需要，用于构建全书索引）
 */
export async function generateVolumeChapters(
  worldSetting: string,
  characters: { name: string; role: string; identity: string }[],
  volume: { title: string; summary: string },
  volumeIndex: number,
  totalVolumes: number,
  genres: string[],
  styles: string[],
  chapterCount: number = 40,
  startChapterNumber: number = 1,
  guidance: string = '',
  characterArchives?: CharacterArchive[],
  contextInfo?: {
    previousVolumeChapters?: string[]
    previousVolumeSummary?: string
    nextVolumeSummary?: string
    nextVolumeDetails?: {
      title: string
      summary: string
      mainPlot?: string
      keyEvents?: string[]
    }
    writtenChaptersSummary?: string[]
  },
  useCompression: boolean = true,
  allVolumes?: Volume[]
): Promise<{ chapterNumber: number; title: string; outline: string }[]> {
  console.log('[AutoCreate] 开始生成单卷章节大纲...')
  console.log('[AutoCreate] 参数:', {
    volumeTitle: volume.title,
    chapterCount,
    startChapterNumber,
    volumeIndex,
    totalVolumes,
    useCompression
  })

  try {
    // 如果启用压缩且提供了allVolumes，使用压缩上下文
    let effectiveWorldSetting = worldSetting
    let effectiveContextInfo = contextInfo

    if (useCompression && allVolumes && allVolumes.length > 0) {
      console.log('[AutoCreate] 使用智能压缩模式...')

      const compressed = buildCompressedContext({
        worldSetting,
        characters: characterArchives || characters.map(c => ({
          name: c.name,
          identity: c.identity,
          status: 'active' as const,
          relationships: []
        })),
        allVolumes,
        currentVolumeIndex: volumeIndex
      })

      // 替换为压缩后的内容
      effectiveWorldSetting = compressed.compressedWorldSetting
      effectiveContextInfo = {
        ...contextInfo,
        // 使用全书索引替代部分上下文
        previousVolumeSummary: compressed.previousVolumeKeyPoints,
        nextVolumeSummary: compressed.nextVolumeKeyPoints,
        // 添加全书索引到扩展信息中
        volumeIndex: compressed.volumeIndex
      } as any

      console.log('[AutoCreate] 压缩效果:', {
        原始世界观字数: worldSetting.length,
        压缩后字数: compressed.compressedWorldSetting.length,
        节约: `${Math.round((1 - compressed.compressedWorldSetting.length / worldSetting.length) * 100)}%`
      })
    }

    // 构建边界约束（如果有卷信息）
    if (allVolumes && allVolumes.length > 0) {
      const currentVolume = allVolumes[volumeIndex] || { title: volume.title, summary: volume.summary } as Volume
      const previousVolume = volumeIndex > 0 ? allVolumes[volumeIndex - 1] : undefined
      const nextVolume = volumeIndex < allVolumes.length - 1 ? allVolumes[volumeIndex + 1] : undefined

      const boundary = buildVolumeBoundary(currentVolume, volumeIndex, previousVolume, nextVolume)
      const boundaryPrompt = buildBoundaryConstraintPrompt(boundary)

      effectiveContextInfo = {
        ...effectiveContextInfo,
        boundaryConstraint: boundaryPrompt
      } as any

      console.log('[AutoCreate] 边界约束已添加:', {
        mustComplete: boundary.mustCompleteEvents.length,
        forbidden: boundary.forbiddenEvents.length,
        completed: boundary.completedEvents.length
      })
    }

    const prompt = buildVolumeChaptersPrompt(
      effectiveWorldSetting,
      characters.map(c => ({
        name: c.name,
        role: c.role as 'protagonist' | 'supporting' | 'antagonist',
        identity: c.identity,
        status: 'active' as const
      })),
      volume,
      volumeIndex,
      totalVolumes,
      genres,
      styles,
      chapterCount,
      startChapterNumber,
      guidance,
      characterArchives,
      effectiveContextInfo
    )

    console.log('[AutoCreate] 提示词长度:', prompt.length)
    console.log('[AutoCreate] 调用 Gemini API...')

    const response = await generateText(prompt)

    console.log('[AutoCreate] Gemini 响应长度:', response.length)
    console.log('[AutoCreate] 解析章节数据...')

    const chapters = parseChaptersResponse(response, chapterCount, startChapterNumber)

    console.log('[AutoCreate] 成功生成章节数:', chapters.length)

    // 验证生成的章节是否有边界冲突
    if (allVolumes && allVolumes.length > 0) {
      const currentVolume = allVolumes[volumeIndex] || { title: volume.title, summary: volume.summary } as Volume
      const previousVolume = volumeIndex > 0 ? allVolumes[volumeIndex - 1] : undefined
      const nextVolume = volumeIndex < allVolumes.length - 1 ? allVolumes[volumeIndex + 1] : undefined

      const boundary = buildVolumeBoundary(currentVolume, volumeIndex, previousVolume, nextVolume)
      const validationResult = validateGeneratedOutlines(chapters, boundary)

      if (!validationResult.isValid) {
        console.warn('[AutoCreate] 大纲边界验证发现问题:')
        console.warn(formatValidationResult(validationResult))
        // 将验证结果附加到章节数据中（供UI层读取）
        ;(chapters as any).__validationResult = validationResult
      } else {
        console.log('[AutoCreate] 大纲边界验证通过')
      }
    }

    return chapters
  } catch (error: any) {
    console.error('[AutoCreate] 生成章节大纲失败:', error)
    throw new Error(`生成章节大纲失败: ${error.message}`)
  }
}

/**
 * 解析百万巨著框架响应
 */
function parseMillionFramework(response: string): {
  worldSetting: string
  characters: Partial<Character>[]
  volumes: { title: string; summary: string; mainPlot?: string; keyEvents?: string[] }[]
} {
  try {
    let jsonStr = response.trim()
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

    return {
      worldSetting: data.worldSetting || '',
      characters: (data.characters || []).map((char: any) => ({
        name: char.name || '未命名角色',
        role: char.role || 'supporting',
        gender: char.gender || '',
        age: char.age || '',
        identity: char.identity || '',
        description: char.description || '',
        arc: char.arc || '',
        status: 'pending'
      })),
      volumes: (data.volumes || []).map((vol: any) => ({
        title: vol.title || '未命名卷',
        summary: vol.summary || '',
        mainPlot: vol.mainPlot || '',
        keyEvents: vol.keyEvents || []
      }))
    }
  } catch (error) {
    console.error('Failed to parse million framework:', error)
    // 返回默认的12卷结构
    const defaultVolumes = Array.from({ length: 12 }, (_, i) => ({
      title: `第${i + 1}卷`,
      summary: '',
      mainPlot: '',
      keyEvents: []
    }))
    return {
      worldSetting: response,
      characters: [],
      volumes: defaultVolumes
    }
  }
}

/**
 * 解析章节响应
 */
function parseChaptersResponse(
  response: string,
  expectedCount: number = 40,
  startChapterNumber: number = 1
): { chapterNumber: number; title: string; outline: string }[] {
  console.log('[AutoCreate] 开始解析章节响应，期望章节数:', expectedCount)

  try {
    let jsonStr = response.trim()

    // 提取 JSON (如果包含在代码块中)
    const jsonMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/)
    if (jsonMatch) {
      console.log('[AutoCreate] 从代码块中提取 JSON')
      jsonStr = jsonMatch[1].trim()
    }

    // 提取 JSON 对象
    const startIndex = jsonStr.indexOf('{')
    const endIndex = jsonStr.lastIndexOf('}')
    if (startIndex !== -1 && endIndex !== -1) {
      jsonStr = jsonStr.substring(startIndex, endIndex + 1)
    } else {
      console.warn('[AutoCreate] 未找到 JSON 对象标记')
      throw new Error('响应中未找到有效的 JSON 对象')
    }

    console.log('[AutoCreate] JSON 字符串长度:', jsonStr.length)

    const data = JSON.parse(jsonStr)

    if (!data.chapters || !Array.isArray(data.chapters)) {
      console.error('[AutoCreate] 响应中没有 chapters 数组')
      throw new Error('响应格式错误：缺少 chapters 数组')
    }

    console.log('[AutoCreate] 解析到章节数:', data.chapters.length)

    const chapters = (data.chapters || []).map((ch: any, index: number) => {
      const chapter = {
        chapterNumber: ch.chapterNumber || (startChapterNumber + index),
        title: ch.title || `未命名章节`,
        outline: ch.outline || ''
      }

      if (!ch.title) {
        console.warn(`[AutoCreate] 第 ${chapter.chapterNumber} 章缺少标题`)
      }
      if (!ch.outline) {
        console.warn(`[AutoCreate] 第 ${chapter.chapterNumber} 章缺少大纲`)
      }

      return chapter
    })

    // 如果章节数过多，截断多余章节（防止AI误解生成过多）
    if (chapters.length > expectedCount) {
      console.warn(`[AutoCreate] 章节数超出预期，截断多余章节: ${chapters.length} -> ${expectedCount}`)
      chapters.splice(expectedCount)
    }

    // 如果章节数不够，补充空章节
    if (chapters.length < expectedCount) {
      console.warn(`[AutoCreate] 章节数不足，补充空章节: ${chapters.length} -> ${expectedCount}`)
      while (chapters.length < expectedCount) {
        chapters.push({
          chapterNumber: startChapterNumber + chapters.length,
          title: `未命名章节`,
          outline: ''
        })
      }
    }

    console.log('[AutoCreate] 章节解析成功，最终章节数:', chapters.length)
    return chapters
  } catch (error: any) {
    console.error('[AutoCreate] 解析章节失败:', error)
    console.error('[AutoCreate] 原始响应 (前500字符):', response.slice(0, 500))
    console.error('[AutoCreate] 原始响应 (后500字符):', response.slice(-500))

    // 返回默认章节
    console.log('[AutoCreate] 返回默认章节结构')
    return Array.from({ length: expectedCount }, (_, i) => ({
      chapterNumber: startChapterNumber + i,
      title: `未命名章节`,
      outline: ''
    }))
  }
}

/**
 * 解析框架响应
 */
function parseFrameworkResponse(response: string): AutoCreateResult {
  try {
    // 尝试提取 JSON
    let jsonStr = response.trim()

    // 如果被 markdown 代码块包裹，提取出来
    const jsonMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/)
    if (jsonMatch) {
      jsonStr = jsonMatch[1].trim()
    }

    // 尝试找到 JSON 对象的开始和结束
    const startIndex = jsonStr.indexOf('{')
    const endIndex = jsonStr.lastIndexOf('}')
    if (startIndex !== -1 && endIndex !== -1) {
      jsonStr = jsonStr.substring(startIndex, endIndex + 1)
    }

    const data = JSON.parse(jsonStr)

    // 验证并规范化数据
    return {
      worldSetting: data.worldSetting || '',
      characters: (data.characters || []).map((char: any) => ({
        name: char.name || '未命名角色',
        role: char.role || 'supporting',
        gender: char.gender || '',
        age: char.age || '',
        identity: char.identity || '',
        description: char.description || '',
        arc: char.arc || '',
        status: 'pending'
      })),
      volumes: (data.volumes || []).map((vol: any) => ({
        title: vol.title || '未命名卷',
        summary: vol.summary || '',
        chapters: (vol.chapters || []).map((ch: any) => ({
          title: ch.title || '未命名章节',
          outline: ch.outline || ''
        }))
      }))
    }
  } catch (error) {
    console.error('Failed to parse framework response:', error)
    console.log('Raw response:', response)

    // 返回默认结构
    return {
      worldSetting: response, // 把原始响应作为世界观
      characters: [],
      volumes: [{
        title: '第一卷',
        summary: '',
        chapters: [{ title: '第一章', outline: '' }]
      }]
    }
  }
}

/**
 * 单章大纲生成（节约token版，但包含必要上下文）
 * @param prevOutline - 前一章大纲（用于承接）
 * @param chapterNumber - 当前章节编号
 * @param volumeSummary - 卷简介（精简版）
 * @param genres - 题材标签
 * @param guidance - 用户指导意见
 * @param contextInfo - 上下文信息（避免重复）
 */
export async function generateSingleChapterOutline(
  prevOutline: string,
  chapterNumber: number,
  volumeSummary: string,
  genres: string[],
  guidance: string = '',
  contextInfo?: {
    existingOutlines?: string[]  // 已有章节大纲（标题）
    writtenSummary?: string      // 已写内容摘要
    previousVolumeInfo?: string  // 上一卷最后几章信息
    previousVolumeSummary?: string  // 上一卷完整摘要
    nextVolumeInfo?: string      // 下一卷信息
    characterInfo?: string       // 角色档案（精简版）
  }
): Promise<{ title: string; outline: string }> {
  const guidanceText = guidance.trim() ? `\n【指导】${guidance.trim()}` : ''

  // 构建上下文信息（精简版）
  let contextSection = ''
  if (contextInfo) {
    if (contextInfo.existingOutlines && contextInfo.existingOutlines.length > 0) {
      // 只显示最近3章，避免token过多
      const recentOutlines = contextInfo.existingOutlines.slice(-3)
      contextSection += `\n【前几章】${recentOutlines.join('；')}`
    }
    if (contextInfo.writtenSummary) {
      contextSection += `\n【已写】${contextInfo.writtenSummary.slice(0, 100)}`
    }
    if (contextInfo.previousVolumeSummary) {
      contextSection += `\n【⛔上卷已完成】${contextInfo.previousVolumeSummary.slice(0, 150)}（不可重复）`
    } else if (contextInfo.previousVolumeInfo) {
      contextSection += `\n【上卷】${contextInfo.previousVolumeInfo.slice(0, 80)}（不可重复）`
    }
    if (contextInfo.nextVolumeInfo) {
      contextSection += `\n【⛔下卷预告】${contextInfo.nextVolumeInfo.slice(0, 150)}（不可提前写）`
    }
    if (contextInfo.characterInfo) {
      contextSection += `\n【角色】${contextInfo.characterInfo.slice(0, 100)}`
    }
  }

  const prompt = `写第${chapterNumber}章大纲。
【卷情】${volumeSummary.slice(0, 200)}
【前章】${prevOutline.slice(0, 150) || '开篇'}${contextSection}
【风格】${genres.slice(0, 3).join('、')}${guidanceText}

⚠️ 不可重复已写内容和上卷内容，不可提前写下卷内容，必须推进当前卷剧情！

返回JSON：{"title":"标题（10字内，无编号）","outline":"50-80字：场景+冲突+悬念，简洁无废话"}`

  const response = await generateText(prompt)

  try {
    let jsonStr = response.trim()
    const match = jsonStr.match(/\{[\s\S]*\}/)
    if (match) jsonStr = match[0]
    const data = JSON.parse(jsonStr)
    return {
      title: data.title || '未命名',
      outline: data.outline || ''
    }
  } catch {
    return { title: '未命名', outline: response.slice(0, 150) }
  }
}

/**
 * 批量单章生成（节约token版，但包含必要上下文）
 * 逐章生成，每章基于前一章承接，并包含必要的上下文信息避免重复
 */
export async function generateChaptersOneByOne(
  volumeSummary: string,
  existingChapters: { title: string; outline: string }[],
  count: number,
  genres: string[],
  guidance: string = '',
  onProgress?: (current: number, total: number) => void,
  startChapterNumber?: number,
  extendedContext?: {
    writtenSummary?: string      // 已写内容摘要
    previousVolumeInfo?: string  // 上一卷最后几章信息
    previousVolumeSummary?: string  // 上一卷完整摘要
    nextVolumeInfo?: string      // 下一卷信息
    characterInfo?: string       // 角色档案（精简版）
  }
): Promise<{ chapterNumber: number; title: string; outline: string }[]> {
  const startNum = startChapterNumber || (existingChapters.length + 1)

  console.log('[AutoCreate] 开始逐章生成大纲...')
  console.log('[AutoCreate] 参数:', {
    existingCount: existingChapters.length,
    newCount: count,
    startNum,
    hasExtendedContext: !!extendedContext
  })

  const results: { chapterNumber: number; title: string; outline: string }[] = []
  let prevOutline = existingChapters.length > 0
    ? existingChapters[existingChapters.length - 1].outline
    : ''

  // 准备已有章节的标题列表（用于上下文）
  const existingOutlines = existingChapters.map(ch => ch.title)

  try {
    for (let i = 0; i < count; i++) {
      const chapterNum = startNum + i
      console.log(`[AutoCreate] 正在生成第 ${chapterNum} 章...`)
      onProgress?.(i + 1, count)

      // 构建上下文信息
      const contextInfo = {
        existingOutlines: [...existingOutlines, ...results.map(r => `第${r.chapterNumber}章 ${r.title}`)],
        writtenSummary: extendedContext?.writtenSummary,
        previousVolumeInfo: extendedContext?.previousVolumeInfo,
        previousVolumeSummary: extendedContext?.previousVolumeSummary,
        nextVolumeInfo: extendedContext?.nextVolumeInfo,
        characterInfo: extendedContext?.characterInfo
      }

      const result = await generateSingleChapterOutline(
        prevOutline,
        chapterNum,
        volumeSummary,
        genres,
        guidance,
        contextInfo
      )

      console.log(`[AutoCreate] 第 ${chapterNum} 章生成成功:`, result.title)

      results.push({
        chapterNumber: chapterNum,
        title: result.title,
        outline: result.outline
      })

      prevOutline = result.outline
    }

    console.log('[AutoCreate] 逐章生成完成，总计:', results.length)
    return results
  } catch (error: any) {
    console.error('[AutoCreate] 逐章生成失败:', error)
    const failedChapter = results.length + 1
    const errorMsg = error.message || String(error)

    // 如果已经生成了一些章节，提示用户
    if (results.length > 0) {
      throw new Error(`在第 ${failedChapter} 章生成时失败（已成功生成 ${results.length} 章）: ${errorMsg}`)
    }

    throw new Error(`逐章生成失败: ${errorMsg}`)
  }
}

/**
 * 生成单章正文
 */
export async function generateChapterContent(
  worldSetting: string,
  characters: { name: string; description: string; status?: string; deathChapter?: string }[],
  chapterOutline: string,
  previousContent: string,
  styles: string[]
): Promise<string> {
  // 分离存活和已故角色
  const activeChars = characters.filter(c => c.status !== 'deceased')
  const deceasedChars = characters.filter(c => c.status === 'deceased')

  const characterInfo = activeChars
    .map(c => `${c.name}：${c.description.slice(0, 100)}`)
    .join('\n')

  // 构建已故角色警告
  let deceasedSection = ''
  if (deceasedChars.length > 0) {
    deceasedSection = `

【🚨 已故角色 - 绝对禁止出场】
以下角色已死亡，在本章中绝对不能让他们说话、出现或有任何活动：
${deceasedChars.map(c => `- ${c.name}${c.deathChapter ? `（死于：${c.deathChapter}）` : ''}`).join('\n')}
⚠️ 可以通过回忆、他人提及等方式间接涉及，但禁止直接出场！`
  }

  const prompt = `你是一个专业的网文作家。

【世界观设定】
${worldSetting.slice(0, 1000)}

【主要人物（存活）】
${characterInfo}${deceasedSection}

【本章大纲】
${chapterOutline}

【前文回顾】
${previousContent ? previousContent.slice(-2000) : '这是故事的开始'}

【写作风格】
${styles.join('、') || '现代轻快、画面感强'}

请根据以上信息，撰写本章正文（2000-3000字）。

要求：
1. 坚持"Show, don't tell"原则，通过动作和对话表现情绪
2. 章节结尾必须留有悬念
3. 情节紧凑，避免大段心理描写
4. 对话要符合人物性格
5. 避免降智打脸、无脑送人头等网文毒点
6. 严格遵守角色生死状态，已故角色禁止出场

请直接输出正文内容，不要包含任何元信息或解释。`

  return generateText(prompt)
}
