import { generateText } from './gemini'
import type { Character } from '../types'

/**
 * 生成剧情摘要 - 用于保持长篇连贯性
 * 每隔一定章节更新一次摘要
 */
export async function generateStorySummary(
  existingSummary: string,
  recentChapters: { title: string; content: string }[],
  characters: Character[]
): Promise<string> {
  if (recentChapters.length === 0) return existingSummary

  const recentContent = recentChapters
    .map(ch => `【${ch.title}】\n${ch.content.slice(0, 800)}`)
    .join('\n\n')

  const characterNames = characters.map(c => c.name).join('、')

  const prompt = `你是一个专业的小说编辑，请根据以下信息更新故事摘要。

【现有摘要】
${existingSummary || '暂无摘要'}

【最近章节内容】
${recentContent}

【主要角色】
${characterNames}

请生成一份简洁但完整的剧情摘要（300-500字），要求：
1. 记录所有重要事件和转折点
2. 明确标注哪些角色已经死亡（如有）
3. 记录角色之间的关系变化
4. 记录主角的能力/实力变化
5. 记录重要的物品、地点变化
6. 按时间顺序组织

格式要求：
- 用简洁的陈述句
- 重要信息用【】标注
- 死亡角色用"已死亡"标注

只输出摘要内容，不要任何解释。`

  return generateText(prompt)
}

/**
 * TXT格式化 - 微软记事本标准格式
 * 每段开头缩进两个全角空格，段落之间换行
 */
export function formatToTxt(content: string): string {
  if (!content) return ''

  // 移除HTML标签（如果有）
  let text = content.replace(/<[^>]+>/g, '\n')

  // 分割段落 - 按多个换行符或双换行分割
  const paragraphs = text
    .split(/\n\s*\n|\r\n\s*\r\n/)
    .flatMap(p => p.split(/\n|\r\n/))
    .map(p => p.trim())
    .filter(p => p.length > 0)

  // 格式化：每段开头缩进两个全角空格
  const formatted = paragraphs
    .map(p => {
      // 移除已有的缩进
      p = p.replace(/^[\s　]+/, '')
      // 添加两个全角空格缩进
      return '　　' + p
    })
    .join('\r\n')  // 使用Windows换行符

  return formatted
}

/**
 * 将内容转换为HTML显示格式（用于编辑器）
 */
export function formatToHtml(content: string): string {
  if (!content) return ''

  // 按换行分割
  const lines = content.split(/\r\n|\n/)

  // 转换为HTML段落
  return lines
    .filter(line => line.trim().length > 0)
    .map(line => `<p>${line}</p>`)
    .join('')
}

/**
 * 严格按大纲写作 - 单章生成
 * @param storySummary - 前情提要，用于保持长篇连贯性
 */
export async function writeChapterStrict(
  worldSetting: string,
  characters: Character[],
  chapterTitle: string,
  chapterOutline: string,
  previousChapterContent: string,
  nextChapterOutline: string,
  styles: string[],
  targetWordCount: number = 2500,
  storySummary: string = ''
): Promise<string> {
  // 分类角色状态
  const activeChars = characters.filter(c => c.status !== 'deceased')
  const deceasedChars = characters.filter(c => c.status === 'deceased')

  const characterInfo = activeChars
    .slice(0, 6)
    .map(c => `【${c.name}】${c.role === 'protagonist' ? '主角' : c.role === 'antagonist' ? '反派' : '配角'}，${c.identity}。${c.description?.slice(0, 100) || ''}`)
    .join('\n')

  // 死亡角色警告
  const deceasedWarning = deceasedChars.length > 0
    ? `\n\n【已死亡角色 - 禁止出场】\n以下角色已在之前的剧情中死亡，绝对不能让他们出现或说话：\n${deceasedChars.map(c => `- ${c.name}（已死亡）`).join('\n')}\n`
    : ''

  // 前情提要
  const summarySection = storySummary
    ? `\n【前情提要 - 重要剧情摘要】\n${storySummary}\n请确保本章内容与以上剧情保持一致，不要出现矛盾。\n`
    : ''

  const prompt = `你是一个经验丰富的网文作家，正在创作一部商业小说。你的写作风格自然流畅，没有AI的痕迹。

【核心创作原则】
像真正的人类作家一样写作，让读者完全感觉不到这是AI生成的内容。

【严禁的AI写作痕迹 - 这些是AI的典型特征，必须完全避免】

1. 禁止任何形式的总结和升华：
   ❌ "这一战让他明白了..."
   ❌ "经此一役，他终于成长了"
   ❌ "他知道，这只是开始"
   ❌ "命运的齿轮开始转动"
   ❌ 章末写感悟、领悟、反思
   ✅ 正确做法：停在具体的动作、对话或场景上

2. 禁止AI式套话和过渡：
   ❌ "就这样"、"于是"、"总之"开头
   ❌ "就在这时"、"突然间"、"霎时间"
   ❌ "不知过了多久"、"时间一分一秒过去"
   ❌ "他深吸一口气"（每章都出现）
   ❌ "眼中闪过一丝..."、"心中一动"
   ❌ "一股强大的气息"、"一道身影"
   ✅ 正确做法：直接写动作，省略过渡词

3. 禁止抽象和模糊的描写：
   ❌ "仿佛"、"似乎"、"宛如"过度使用
   ❌ "难以言喻的感觉"、"莫名的情绪"
   ❌ "说不出的压迫感"、"无法形容的..."
   ❌ "前所未有的体验"
   ✅ 正确做法：写具体的感官细节

4. 禁止解释和说教：
   ❌ 解释角色为什么这么做
   ❌ 解释事件背后的意义
   ❌ 插入作者视角的评论
   ❌ "因为...所以..."的因果解释
   ✅ 正确做法：只写发生了什么，让读者自己理解

5. 禁止重复和注水：
   ❌ 同一个动作或情绪反复描写
   ❌ 换个说法重复同样的意思
   ❌ 大段的心理独白
   ❌ 为凑字数而拖沓
   ✅ 正确做法：每句话都推进剧情

【自然写作的技巧】

1. 动作描写要具体：
   ❌ "他很愤怒"
   ✅ "他握紧拳头，指节发白"

   ❌ "她很紧张"
   ✅ "她咬着下唇，手指绞着衣角"

2. 对话要自然简洁：
   ❌ "我不会放过你的！"他咬牙切齿地说道，眼中充满了愤怒的火焰
   ✅ "我不会放过你。"他说

   - 不要每句话都加"他说道"、"她回答道"
   - 对话简短有力，符合口语习惯
   - 避免长篇大论式的对话

3. 场景切换要干脆：
   ❌ 经过了漫长的等待，时间一分一秒过去，终于...
   ✅ 三天后。

   ❌ 就在这个时候，突然间，一道身影出现了
   ✅ 门开了，李四走了进来。

4. 情绪通过细节展现：
   ❌ 他感到非常恐惧，心中充满了害怕
   ✅ 他的呼吸变得急促，手心渗出冷汗

5. 章节结尾的处理：
   ❌ 他转身离开，心中暗暗发誓，总有一天要报这个仇（总结）
   ✅ 他转身离开。（停在动作）

   ❌ 这一夜，注定不平静（升华）
   ✅ 窗外传来一声尖叫。（悬念）

【网文写作的实战技巧】

1. 节奏控制：
   - 紧张场景：短句、快节奏、多动作
   - 日常场景：适当放缓，但不拖沓
   - 对话场景：一问一答，简洁明快

2. 描写的密度：
   - 重要场景：多写感官细节（视觉、听觉、触觉）
   - 过渡场景：一笔带过，不展开
   - 战斗场景：动作清晰，避免"一片混乱"这种空话

3. 人物塑造：
   - 通过动作和对话展现性格
   - 每个角色说话方式应该有区别
   - 避免所有角色都用同样的语气

4. 避免说明文式写作：
   ❌ 这个地方叫做XX，是一个非常危险的地方，传说中...（百科式介绍）
   ✅ "小心点，这里是XX。"张三压低声音。（通过对话自然引入）

5. 制造悬念的技巧：
   - 在关键时刻打断
   - 留下疑问但不解答
   - 埋下伏笔但不明说

【逻辑一致性 - 绝对禁止违反】
1. 已死亡的角色绝对不能复活或出现
2. 已经发生的事件不能被推翻或遗忘
3. 角色的能力、身份不能与之前的设定矛盾
4. 时间线必须保持一致
5. 角色性格要保持连贯，不能突然转性
${deceasedWarning}

---

【创作素材】

【世界观背景】
${worldSetting.slice(0, 600)}

【主要角色（当前存活）】
${characterInfo}
${summarySection}

【本章任务】
章节标题：${chapterTitle}
章节大纲：${chapterOutline}

【前文衔接】
${previousChapterContent ? `前一章结尾（最后1500字）：
${previousChapterContent.slice(-1500)}

【本章开头 - 自然承接技巧】
本章开头必须自然承接上一章结尾的悬念，不能跳过或忽略。

✅ 正确的承接方式：

示例1 - 直接承接动作：
  上一章结尾：「门外传来急促的脚步声。」
  本章开头：「门被推开，一个黑衣人闯了进来。」（直接写结果）
  ❌ 错误：「就在这时，门被推开了。」（AI过渡词）
  ❌ 错误：「第二天一早...」（直接跳过悬念）

示例2 - 接续对话：
  上一章结尾：「'你终于来了。'暗处有人开口。」
  本章开头：「是李四的声音。」（揭晓身份）
  ❌ 错误：「就这样，他们见面了。」（空话）

示例3 - 解答悬念：
  上一章结尾：「他的手机响了，是一个陌生号码。」
  本章开头：「'喂？'他接起电话。」（自然接续）
  ❌ 错误：「不知过了多久...」（跳过时间）

【开头的黄金法则】
1. 不用过渡词：禁止"就在这时"、"突然"、"于是"等AI惯用句
2. 直接写动作：上一章停在哪，本章就从哪接着写
3. 0.5秒原则：开头场景距离上一章结尾不超过0.5秒（除非明确需要时间跳跃）
4. 承接但不重复：揭晓悬念，但不复述上一章的内容` : `这是故事的开始，从一个吸引人的场景或对话切入。

【开头的写作要求】
1. 第一段立即进入场景，不要铺垫
2. 用动作或对话开场，不要描写或心理活动
3. 让读者立刻进入状态`}

${nextChapterOutline ? `【下章预告】
下一章：${nextChapterOutline}

【断章技巧 - 承上启下的引子】
本章结尾必须为下章埋下引子，用最后1-2句话制造悬念，让读者忍不住想看下一章。

✅ 好的结尾示例：
「门外传来急促的脚步声。」
「他的手机响了，是一个陌生号码。」
「'你终于来了。'暗处有人开口。」
「远处升起一道黑烟。」

❌ 差的结尾（有AI味）：
「他不知道，更大的危机正在等着他。」（多余的铺垫）
「这一切都还只是开始。」（空洞的总结）
「他转身离开，心中暗暗发誓。」（内心独白）

【结尾的黄金法则】
1. 停在动作的一半：别写完整个动作，让读者心里痒痒
2. 停在意外出现时：新角色、新事件、新转折，戛然而止
3. 停在对话前半句：引出话题但不说破，吊胃口
4. 绝对不加任何解释、评论、暗示` : `【断章技巧 - 网文结尾的艺术】
这是一个章节的结尾，需要让读者产生"必须看下一章"的冲动。

✅ 好的结尾方式：
方式1 - 悬念型：
  「门突然开了。」
  「手机屏幕亮起：【你的秘密我都知道】」
  「那道熟悉的身影出现在走廊尽头。」

方式2 - 冲突升级：
  「'你敢！'」
  「枪声响起。」
  「他握紧了拳头，转身走向那扇门。」

方式3 - 信息爆炸：
  「'她是你亲妹妹。'」
  「屏幕上显示：【倒计时：00:05:00】」
  「'老板说，行动取消。'」

❌ 绝对禁止的结尾（有AI味的废话）：
「他知道，真正的考验才刚刚开始。」（空洞总结）
「这一夜注定不平静。」（无意义升华）
「他转身离去，眼中闪过坚定。」（内心戏）
「暴风雨即将来临。」（比喻废话）
「命运的齿轮开始转动。」（中二病）

【结尾写作要求】
1. 最后一句必须是：动作、对话、或场景描写
2. 停在最让人好奇的地方
3. 不超过20个字
4. 绝不加任何解释`}

---

【写作要求】

风格：${styles.join('、') || '现代轻快、画面感强'}
字数：约${targetWordCount}字（宁缺毋滥，不要注水）

【输出规范】
1. 直接输出正文内容，不要标题、不要解释
2. 每段开头缩进两个全角空格（　　）
3. 段落之间空一行
4. 严格按大纲写，不多不少
5. 最后一段必须是具体的动作、对话或场景
6. 绝对禁止任何形式的总结句、感悟句、升华句

【检查清单 - 写完后自查】
□ 没有"就这样"、"于是"、"总之"等AI套话
□ 没有"眼中闪过"、"深吸一口气"等AI惯用句
□ 没有结尾总结或升华
□ 对话简洁自然
□ 描写具体不抽象
□ 严格遵循大纲
□ 字数适中不注水

现在开始创作：`

  const content = await generateText(prompt)

  // 确保格式正确
  return formatToTxt(content)
}

/**
 * 批量连续写作 - 进度回调
 */
export interface WriteProgress {
  currentChapter: number
  totalChapters: number
  chapterTitle: string
  status: 'writing' | 'saving' | 'complete' | 'error'
  error?: string
}

/**
 * 连续自动写作多章
 */
export async function writeChaptersContinuous(
  worldSetting: string,
  characters: Character[],
  chaptersToWrite: {
    id: string
    title: string
    outline: string
    content: string
  }[],
  styles: string[],
  targetWordCount: number,
  onProgress: (progress: WriteProgress) => void,
  onChapterComplete: (chapterId: string, content: string) => Promise<void>,
  shouldStop: () => boolean
): Promise<{ completed: number; failed: number }> {
  let completed = 0
  let failed = 0
  let previousContent = ''

  for (let i = 0; i < chaptersToWrite.length; i++) {
    // 检查是否应该停止
    if (shouldStop()) {
      break
    }

    const chapter = chaptersToWrite[i]
    const nextChapter = chaptersToWrite[i + 1]

    onProgress({
      currentChapter: i + 1,
      totalChapters: chaptersToWrite.length,
      chapterTitle: chapter.title,
      status: 'writing'
    })

    try {
      // 如果章节已有内容，使用已有内容作为前文
      if (chapter.content && chapter.content.trim().length > 100) {
        previousContent = chapter.content
        completed++
        continue
      }

      // 生成章节内容
      const content = await writeChapterStrict(
        worldSetting,
        characters,
        chapter.title,
        chapter.outline,
        previousContent,
        nextChapter?.outline || '',
        styles,
        targetWordCount
      )

      onProgress({
        currentChapter: i + 1,
        totalChapters: chaptersToWrite.length,
        chapterTitle: chapter.title,
        status: 'saving'
      })

      // 保存章节
      await onChapterComplete(chapter.id, content)

      previousContent = content
      completed++

    } catch (error: any) {
      console.error(`Failed to write chapter ${chapter.title}:`, error)
      failed++
      onProgress({
        currentChapter: i + 1,
        totalChapters: chaptersToWrite.length,
        chapterTitle: chapter.title,
        status: 'error',
        error: error.message
      })
    }
  }

  onProgress({
    currentChapter: chaptersToWrite.length,
    totalChapters: chaptersToWrite.length,
    chapterTitle: '',
    status: 'complete'
  })

  return { completed, failed }
}

/**
 * 单章重写 - 保持风格一致
 */
export async function rewriteChapter(
  worldSetting: string,
  characters: Character[],
  chapterTitle: string,
  chapterOutline: string,
  currentContent: string,
  styles: string[],
  instruction: string
): Promise<string> {
  const characterInfo = characters
    .slice(0, 4)
    .map(c => `${c.name}(${c.role})`)
    .join('、')

  const prompt = `你是一个经验丰富的网文作家，现在需要重写/修改一个章节。

【创作背景】
世界观：${worldSetting.slice(0, 400)}
人物：${characterInfo}
章节：${chapterTitle}
大纲：${chapterOutline}

【当前版本】
${currentContent}

【修改需求】
${instruction}

【重写要求】
1. 严格按照大纲和修改需求进行调整
2. 保持风格：${styles.join('、') || '现代轻快、画面感强'}
3. 字数与原文相当，不注水不缩水

【去AI化检查清单】
□ 无总结、感悟、升华（特别是结尾）
□ 无"就这样"、"于是"、"总之"等过渡词
□ 无"深吸一口气"、"眼中闪过"等AI套话
□ 无抽象模糊的描写，全用具体细节
□ 对话简洁自然，不说教
□ 动作清晰，不重复

【输出格式】
直接输出重写后的正文，每段缩进两个全角空格，不要任何解释和标题。
最后一段必须是动作、对话或场景，禁止总结。

现在开始重写：`

  const content = await generateText(prompt)
  return formatToTxt(content)
}

/**
 * AI 扩写 - 基于当前内容继续写作
 */
export async function expandContent(
  currentContent: string,
  chapterOutline: string,
  styles: string[],
  wordCount: number = 500
): Promise<string> {
  const prompt = `你是一个经验丰富的网文作家，正在继续撰写一个章节。

【前文内容（最后2000字）】
${currentContent.slice(-2000)}

【本章大纲】
${chapterOutline || '无明确大纲，根据前文自然发展剧情'}

【续写要求】
1. 风格：${styles.join('、') || '现代轻快、画面感强'}
2. 字数：约${wordCount}字
3. 自然衔接前文，保持风格一致
4. 如有大纲则按大纲推进，无大纲则合理展开
5. 通过动作和对话推进情节，不要写心理独白

【去AI化原则】
- 禁止用"就这样"、"于是"、"突然"等AI过渡词
- 禁止写总结性语句或升华
- 禁止抽象描写，用具体细节
- 对话简洁，符合口语
- 每句话都有作用，不注水

【输出格式】
直接输出续写内容（每段缩进两个全角空格），不要任何解释。
无需过渡语句，直接从前文自然延续。

现在开始续写：`

  const content = await generateText(prompt)
  return formatToTxt(content)
}

/**
 * 全自动写作 - 从指定章节开始，写完自动写下一章
 * 支持剧情摘要功能，每10章更新一次摘要以保持长篇连贯性
 */
export async function autoWriteAll(
  worldSetting: string,
  characters: Character[],
  allChapters: {
    id: string
    volumeId: string
    title: string
    outline: string
    content: string
    order: number
  }[],
  styles: string[],
  targetWordCount: number,
  onProgress: (progress: WriteProgress & { volumeTitle?: string }) => void,
  onChapterComplete: (chapterId: string, content: string) => Promise<void>,
  shouldStop: () => boolean,
  startFromChapterId?: string,
  onSummaryUpdate?: (summary: string) => Promise<void>,
  onCharactersUpdate?: (newChapters: { title: string; content: string }[]) => Promise<void>,
  autoUpdateConfig?: {
    summaryInterval?: number  // 摘要更新频率（章节数），默认20
    characterInterval?: number // 角色更新频率（章节数），默认30
    enableAutoUpdate?: boolean // 是否启用自动更新，默认true
  }
): Promise<{ completed: number; failed: number; totalWords: number }> {
  let completed = 0
  let failed = 0
  let totalWords = 0
  let previousContent = ''
  let storySummary = '' // 剧情摘要
  const recentChapters: { title: string; content: string }[] = [] // 最近写的章节（用于摘要）
  const newChaptersForAnalysis: { title: string; content: string }[] = [] // 新章节（用于角色分析）

  // 配置项
  const config = {
    summaryInterval: autoUpdateConfig?.summaryInterval || 20,
    characterInterval: autoUpdateConfig?.characterInterval || 30,
    enableAutoUpdate: autoUpdateConfig?.enableAutoUpdate !== false
  }

  console.log(`📊 [AutoWrite] 自动更新配置：`, config)

  // 按卷和章节顺序排序
  const sortedChapters = [...allChapters].sort((a, b) => {
    if (a.volumeId !== b.volumeId) {
      return a.volumeId.localeCompare(b.volumeId)
    }
    return a.order - b.order
  })

  // 找到起始位置
  let startIndex = 0
  if (startFromChapterId) {
    const idx = sortedChapters.findIndex(c => c.id === startFromChapterId)
    if (idx >= 0) startIndex = idx
  }

  // 获取起始章节之前的最后一章内容作为前文
  if (startIndex > 0) {
    const prevChapter = sortedChapters[startIndex - 1]
    if (prevChapter.content) {
      previousContent = prevChapter.content
    }

    // 如果是从中间开始，先生成之前章节的摘要
    const previousChapters = sortedChapters.slice(0, startIndex)
      .filter(c => c.content && c.content.length > 100)
      .slice(-10) // 取最近10章
    if (previousChapters.length > 0) {
      try {
        storySummary = await generateStorySummary(
          '',
          previousChapters.map(c => ({ title: c.title, content: c.content })),
          characters
        )
        console.log('Generated initial story summary from previous chapters')
      } catch (e) {
        console.warn('Failed to generate initial summary:', e)
      }
    }
  }

  const chaptersToWrite = sortedChapters.slice(startIndex)
  const totalChapters = chaptersToWrite.length

  for (let i = 0; i < chaptersToWrite.length; i++) {
    if (shouldStop()) {
      break
    }

    const chapter = chaptersToWrite[i]
    const nextChapter = chaptersToWrite[i + 1]

    // 🔥 计算全局章节编号（而不是局部索引）
    const globalChapterNumber = startIndex + i + 1

    // 跳过已有内容的章节
    if (chapter.content && chapter.content.trim().length > 500) {
      previousContent = chapter.content
      recentChapters.push({ title: chapter.title, content: chapter.content })
      completed++
      totalWords += chapter.content.length
      onProgress({
        currentChapter: globalChapterNumber,  // 🔥 使用全局编号
        totalChapters: sortedChapters.length,  // 🔥 总章节数是全书的，不是待写的
        chapterTitle: chapter.title,
        status: 'complete'
      })
      continue
    }

    // 检查大纲
    if (!chapter.outline || chapter.outline.trim().length < 10) {
      onProgress({
        currentChapter: globalChapterNumber,  // 🔥 使用全局编号
        totalChapters: sortedChapters.length,  // 🔥 使用全书总数
        chapterTitle: chapter.title,
        status: 'error',
        error: '缺少大纲'
      })
      failed++
      continue
    }

    // 定期更新摘要和角色档案（减少API调用）
    if (config.enableAutoUpdate) {
      // 更新剧情摘要（用于保持长篇连贯性）
      if (recentChapters.length >= config.summaryInterval) {
        try {
          storySummary = await generateStorySummary(storySummary, recentChapters.slice(-5), characters)
          console.log(`✅ [AutoWrite] 已更新全书摘要 (${recentChapters.length}章)`)

          // 保存摘要到项目
          if (onSummaryUpdate) {
            await onSummaryUpdate(storySummary)
            console.log('✅ [AutoWrite] 全书摘要已保存到项目')
          }

          recentChapters.length = 0 // 清空摘要缓存
        } catch (e) {
          console.warn('Failed to update summary:', e)
        }
      }

      // 更新角色档案（状态、出场、关系）- 频率更低以节省token
      if (newChaptersForAnalysis.length >= config.characterInterval && onCharactersUpdate) {
        try {
          console.log(`🔍 [AutoWrite] 开始分析角色档案 (${newChaptersForAnalysis.length}个新章节)`)
          await onCharactersUpdate(newChaptersForAnalysis)
          console.log(`✅ [AutoWrite] 角色档案已自动更新`)
          newChaptersForAnalysis.length = 0 // 清空角色分析缓存
        } catch (e) {
          console.warn('Failed to update characters:', e)
        }
      }
    }

    onProgress({
      currentChapter: globalChapterNumber,  // 🔥 使用全局编号
      totalChapters: sortedChapters.length,  // 🔥 使用全书总数
      chapterTitle: chapter.title,
      status: 'writing'
    })

    try {
      const content = await writeChapterStrict(
        worldSetting,
        characters,
        chapter.title,
        chapter.outline,
        previousContent,
        nextChapter?.outline || '',
        styles,
        targetWordCount,
        storySummary // 传递剧情摘要
      )

      onProgress({
        currentChapter: globalChapterNumber,  // 🔥 使用全局编号
        totalChapters: sortedChapters.length,  // 🔥 使用全书总数
        chapterTitle: chapter.title,
        status: 'saving'
      })

      await onChapterComplete(chapter.id, content)

      previousContent = content
      recentChapters.push({ title: chapter.title, content })
      newChaptersForAnalysis.push({ title: chapter.title, content }) // 记录新章节
      completed++
      totalWords += content.length

    } catch (error: any) {
      console.error(`Failed to write chapter ${chapter.title}:`, error)
      failed++
      onProgress({
        currentChapter: globalChapterNumber,  // 🔥 使用全局编号
        totalChapters: sortedChapters.length,  // 🔥 使用全书总数
        chapterTitle: chapter.title,
        status: 'error',
        error: error.message
      })
      // 继续写下一章
    }
  }

  // 写作完成后，处理剩余未更新的章节
  if (config.enableAutoUpdate && !shouldStop()) {
    try {
      // 生成最终摘要（如果有剩余章节）
      if (recentChapters.length > 0) {
        storySummary = await generateStorySummary(storySummary, recentChapters, characters)
        console.log(`✅ [AutoWrite] 已生成最终全书摘要 (${recentChapters.length}章)`)

        // 保存摘要到项目
        if (onSummaryUpdate) {
          await onSummaryUpdate(storySummary)
          console.log('✅ [AutoWrite] 最终全书摘要已保存到项目')
        }
      }

      // 最终更新角色档案（只分析新章节）
      if (newChaptersForAnalysis.length > 0 && onCharactersUpdate) {
        console.log(`🔍 [AutoWrite] 开始最终角色档案分析 (${newChaptersForAnalysis.length}个新章节)`)
        await onCharactersUpdate(newChaptersForAnalysis)
        console.log('✅ [AutoWrite] 最终角色档案已更新')
      }
    } catch (e) {
      console.warn('Failed to generate final summary or update characters:', e)
    }
  }

  onProgress({
    currentChapter: totalChapters,
    totalChapters,
    chapterTitle: '',
    status: 'complete'
  })

  return { completed, failed, totalWords }
}
