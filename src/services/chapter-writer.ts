import { generateText } from './gemini'
import type { Character } from '../types'
// Anti-AI guidelines integrated into prompts
// import { getFullAntiAIGuidelines, getSceneSpecificGuidelines, generateSelfCheckList, ENHANCED_ANTI_AI_GUIDELINES } from './anti-ai-guidelines'

/**
 * 生成剧情摘要 - 用于保持长篇连贯性
 * 支持事件驱动更新
 */
export async function generateStorySummary(
  existingSummary: string,
  recentChapters: { title: string; content: string }[],
  characters: Character[],
  options?: {
    triggerReason?: 'interval' | 'major_event' | 'character_death' | 'power_up' | 'new_arc'
    majorEvent?: string
  }
): Promise<string> {
  if (recentChapters.length === 0) return existingSummary

  const recentContent = recentChapters
    .map(ch => `【${ch.title}】\n${ch.content.slice(0, 800)}`)
    .join('\n\n')

  const characterNames = characters.map(c => c.name).join('、')

  // 根据触发原因调整提示
  const triggerContext = options?.triggerReason === 'major_event'
    ? `\n【重大事件】本次更新触发原因：${options.majorEvent || '重大剧情变化'}`
    : options?.triggerReason === 'character_death'
    ? '\n【重要】本次更新因角色死亡触发，请特别标注死亡角色信息'
    : options?.triggerReason === 'power_up'
    ? '\n【重要】本次更新因主角突破触发，请特别记录实力变化'
    : ''

  const prompt = `你是一个专业的小说编辑，请根据以下信息更新故事摘要。

【现有摘要】
${existingSummary || '暂无摘要'}

【最近章节内容】
${recentContent}

【主要角色】
${characterNames}
${triggerContext}

请生成一份简洁但完整的剧情摘要（400-600字），要求：

## 必须记录的信息
1. 主线剧情进展（当前到哪一步）
2. 重要事件和转折点（按时间顺序）
3. 角色状态变化：
   - 死亡角色：【已死亡】标注
   - 实力变化：境界/能力提升
   - 位置变化：重要的地点转移
4. 角色关系变化（新的盟友/敌人/关系破裂等）
5. 未解决的冲突和伏笔

## 格式要求
- 用简洁的陈述句
- 重要信息用【】标注
- 死亡角色用"【已死亡】"明确标注
- 分段组织：主线、角色、伏笔

只输出摘要内容，不要任何解释。`

  // 使用较长的超时时间（2分钟）
  return generateText(prompt, 2, 120000)
}

/**
 * 检测是否应该更新摘要（事件驱动）
 */
export async function shouldUpdateSummary(
  chapterContent: string,
  chapterIndex: number,
  lastUpdateChapter: number,
  config: { intervalChapters: number } = { intervalChapters: 10 }
): Promise<{
  shouldUpdate: boolean
  reason: 'interval' | 'major_event' | 'character_death' | 'power_up' | 'new_arc' | null
  eventDescription?: string
}> {
  // 定期更新
  if (chapterIndex - lastUpdateChapter >= config.intervalChapters) {
    return { shouldUpdate: true, reason: 'interval' }
  }

  // 检测重大事件
  const prompt = `快速判断以下章节是否包含需要立即更新故事摘要的重大事件。

【章节内容片段】
${chapterContent.slice(0, 1500)}

重大事件类型：
1. character_death - 重要角色死亡
2. power_up - 主角重大突破
3. major_event - 重大剧情转折
4. new_arc - 新篇章开始

返回JSON：
\`\`\`json
{
  "hasMajorEvent": true/false,
  "eventType": "事件类型或null",
  "description": "简短描述"
}
\`\`\`
只输出JSON。`

  try {
    const result = await generateText(prompt)
    const jsonMatch = result.match(/```json\s*([\s\S]*?)\s*```/) || result.match(/\{[\s\S]*\}/)

    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[1] || jsonMatch[0])
      if (parsed.hasMajorEvent && parsed.eventType) {
        return {
          shouldUpdate: true,
          reason: parsed.eventType,
          eventDescription: parsed.description
        }
      }
    }
  } catch (e) {
    // 检测失败，不触发更新
  }

  return { shouldUpdate: false, reason: null }
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
 * 跨卷上下文信息
 */
export interface VolumeTransitionContext {
  isNewVolume: boolean           // 是否是新卷的第一章
  previousVolumeName?: string    // 上一卷名称
  currentVolumeName?: string     // 当前卷名称
  previousVolumeLastChapter?: string  // 上一卷最后一章的完整内容（跨卷时使用更多上下文）
}

/**
 * 严格按大纲写作 - 单章生成
 * @param storySummary - 前情提要，用于保持长篇连贯性
 * @param volumeContext - 跨卷上下文信息
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
  storySummary: string = '',
  volumeContext?: VolumeTransitionContext
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

  // 跨卷上下文处理
  const isNewVolume = volumeContext?.isNewVolume || false
  const volumeTransitionSection = isNewVolume && volumeContext?.previousVolumeName
    ? `
╔══════════════════════════════════════════════════════════════╗
║  📚📚📚【新卷开始 - 重要提示】📚📚📚                          ║
╚══════════════════════════════════════════════════════════════╝

🔄 卷切换：「${volumeContext.previousVolumeName}」→「${volumeContext.currentVolumeName || '新卷'}」

【新卷开篇要求】
1. ✅ 这是新卷的第一章，可以有适当的"新篇章感"
2. ✅ 但必须自然承接上一卷结尾，不能跳跃或遗漏
3. ✅ 可以用简短的场景/时间切换，但要平滑过渡
4. ❌ 不要写大段回顾或总结上一卷的内容
5. ❌ 不要有"翻开新篇章"之类的废话

【上一卷结尾回顾】
以下是上一卷最后一章的完整内容，请仔细阅读后自然承接：
${volumeContext.previousVolumeLastChapter || previousChapterContent}

`
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
${volumeTransitionSection}

╔══════════════════════════════════════════════════════════════╗
║  🎯🎯🎯【本章核心任务 - 必须严格执行】🎯🎯🎯                  ║
╚══════════════════════════════════════════════════════════════╝

📖 章节标题：${chapterTitle}

📋 本章大纲（必须100%覆盖，不多不少）：
${chapterOutline}

🔴🔴🔴【严格按大纲写作 - 违反即失败】🔴🔴🔴
1. ✅ 必须写：大纲中提到的每一个情节点、每一个事件
2. ❌ 禁止写：大纲中没有提到的额外情节（不要自由发挥）
3. ❌ 禁止跳过：不能省略大纲中的任何内容
4. ❌ 禁止提前：不能写下一章大纲的内容（见下方"下章预告"）
5. ⚠️ 节奏控制：合理分配字数，大纲中的每个点都要展开描写

【大纲执行检查】
写作前请确认：本章大纲包含哪些关键点？
写作时请对照：每个关键点是否都已充分展开？
写作后请检查：是否写了大纲之外的内容？是否提前写了下一章？

【前文衔接】
${previousChapterContent ? `前一章结尾（最后${isNewVolume ? '3000' : '1500'}字）：
${previousChapterContent.slice(isNewVolume ? -3000 : -1500)}

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

${nextChapterOutline ? `
╔══════════════════════════════════════════════════════════════╗
║  ⛔⛔⛔【下章内容 - 绝对禁止提前写】⛔⛔⛔                     ║
╚══════════════════════════════════════════════════════════════╝

下一章大纲：${nextChapterOutline}

🚫🚫🚫【本章禁止出现以下内容】🚫🚫🚫
以上是下一章的剧情，本章绝对不能写！
- ❌ 不能写下一章大纲中的任何事件
- ❌ 不能让剧情推进到下一章的开头
- ❌ 不能提前揭示下一章才会发生的事

✅ 本章结尾的正确做法：
- 完成本章大纲的全部内容
- 用最后1-2句制造悬念，引向下一章
- 但悬念只是"引子"，不是"开始写下一章"

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
4. 🔴 严格按大纲写，大纲有的必须写，大纲没有的不能写
5. 🔴 不能提前写下一章的内容
6. 最后一段必须是具体的动作、对话或场景
7. 绝对禁止任何形式的总结句、感悟句、升华句

【进阶去AI化要求】
1. 句式变化：长短句比例3:1，每5句至少1个短句
2. 句首变化：禁止连续2句以上"他/她"开头
3. 词汇禁用："一时间"、"刹那间"、"冷冷道"、"淡淡道"
4. 描写技巧：用动词代替形容词，用具体代替抽象
5. 对话规范：每角色有独特说话方式，对话穿插动作描写

【检查清单 - 写完后自查】
□ 🔴 大纲中的每个情节点都已写到（最重要！）
□ 🔴 没有写大纲之外的额外情节
□ 🔴 没有提前写下一章的内容
□ 没有"就这样"、"于是"、"总之"等AI套话
□ 没有"眼中闪过"、"深吸一口气"等AI惯用句
□ 没有结尾总结或升华
□ 没有连续3句以上相同句式
□ 对话简洁自然，有角色特色
□ 描写具体不抽象
□ 长短句有变化
□ 章末是动作/对话/场景，不是感悟
□ 字数适中不注水

现在开始创作：`

  // 使用更长的超时时间（3分钟），因为生成正文需要较长时间
  const content = await generateText(prompt, 2, 180000)

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

  // 使用更长的超时时间（3分钟）
  const content = await generateText(prompt, 2, 180000)
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

  // 使用较长的超时时间（2分钟）
  const content = await generateText(prompt, 2, 120000)
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
    volumeOrder?: number  // 卷的顺序，用于正确排序
    volumeName?: string   // 卷名称，用于跨卷提示
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

  // 配置项（优化：缩短摘要更新间隔，支持事件驱动）
  const config = {
    summaryInterval: autoUpdateConfig?.summaryInterval || 10,  // 从20章缩短到10章
    characterInterval: autoUpdateConfig?.characterInterval || 30,
    enableAutoUpdate: autoUpdateConfig?.enableAutoUpdate !== false,
    enableEventDrivenUpdate: true  // 启用事件驱动更新
  }
  let lastSummaryUpdateChapter = 0  // 记录上次摘要更新的章节

  console.log(`📊 [AutoWrite] 自动更新配置：`, config)

  // 按卷和章节顺序排序 - 使用volumeOrder而不是volumeId字符串比较
  const sortedChapters = [...allChapters].sort((a, b) => {
    // 先按卷的顺序排序
    // 优先使用 volumeOrder，如果未定义则使用 volumeId 分组（确保同卷章节在一起）
    const volOrderA = a.volumeOrder ?? -1
    const volOrderB = b.volumeOrder ?? -1

    // 如果都有 volumeOrder，按 volumeOrder 排序
    if (volOrderA >= 0 && volOrderB >= 0) {
      if (volOrderA !== volOrderB) {
        return volOrderA - volOrderB
      }
    } else if (a.volumeId !== b.volumeId) {
      // 如果没有 volumeOrder 但 volumeId 不同，按 volumeId 分组
      return a.volumeId.localeCompare(b.volumeId)
    }

    // 同一卷内，按章节 order 排序
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

  for (let i = 0; i < chaptersToWrite.length; i++) {
    if (shouldStop()) {
      break
    }

    const chapter = chaptersToWrite[i]
    const nextChapter = chaptersToWrite[i + 1]

    // 🔥 计算全局章节编号（而不是局部索引）
    const globalChapterNumber = startIndex + i + 1
    console.log(`[DEBUG] 章节编号计算: startIndex=${startIndex}, i=${i}, globalChapterNumber=${globalChapterNumber}, totalChapters=${sortedChapters.length}`)

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

    // 检查前一章是否有内容（仅在循环第一次迭代且不是全书第一章时检查）
    // 后续章节因为是按顺序处理的，前一章必然已被处理（写完或跳过）
    if (i === 0 && startIndex > 0) {
      const prevChapter = sortedChapters[startIndex - 1]
      if (prevChapter && (!prevChapter.content || prevChapter.content.trim().length <= 500)) {
        onProgress({
          currentChapter: globalChapterNumber,
          totalChapters: sortedChapters.length,
          chapterTitle: chapter.title,
          status: 'error',
          error: '前一章缺少内容'
        })
        throw new Error(`第 ${globalChapterNumber} 章「${chapter.title}」的前一章「${prevChapter.title}」没有内容，全自动写作已终止。请先确保前面的章节都已生成内容。`)
      }
    }

    // 检查大纲 - 如果缺少大纲，立即终止全自动写作
    if (!chapter.outline || chapter.outline.trim().length < 10) {
      onProgress({
        currentChapter: globalChapterNumber,
        totalChapters: sortedChapters.length,
        chapterTitle: chapter.title,
        status: 'error',
        error: '缺少大纲'
      })
      // 抛出错误终止写作，避免跳过章节导致内容不连贯
      throw new Error(`第 ${globalChapterNumber} 章「${chapter.title}」缺少大纲，全自动写作已终止。请先为该章节生成大纲后再继续。`)
    }

    // 智能更新摘要和角色档案（事件驱动 + 定期更新）
    if (config.enableAutoUpdate && recentChapters.length > 0) {
      const lastContent = recentChapters[recentChapters.length - 1]?.content || ''

      // 检测是否应该更新摘要（事件驱动）
      let shouldUpdate = recentChapters.length >= config.summaryInterval
      let updateReason: 'interval' | 'major_event' | 'character_death' | 'power_up' | 'new_arc' = 'interval'
      let eventDesc = ''

      if (config.enableEventDrivenUpdate && !shouldUpdate && lastContent.length > 500) {
        // 事件驱动检测（只在非定期更新时检测，节省API调用）
        try {
          const eventCheck = await shouldUpdateSummary(
            lastContent,
            globalChapterNumber,
            lastSummaryUpdateChapter,
            { intervalChapters: config.summaryInterval }
          )
          if (eventCheck.shouldUpdate && eventCheck.reason) {
            shouldUpdate = true
            updateReason = eventCheck.reason
            eventDesc = eventCheck.eventDescription || ''
            console.log(`🔔 [AutoWrite] 检测到重大事件触发摘要更新: ${updateReason}`)
          }
        } catch (e) {
          // 检测失败不影响主流程
        }
      }

      // 更新剧情摘要
      if (shouldUpdate) {
        try {
          storySummary = await generateStorySummary(
            storySummary,
            recentChapters.slice(-5),
            characters,
            { triggerReason: updateReason, majorEvent: eventDesc }
          )
          lastSummaryUpdateChapter = globalChapterNumber
          console.log(`✅ [AutoWrite] 已更新全书摘要 (原因: ${updateReason}, 章节数: ${recentChapters.length})`)

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
      // 🔥 检测是否跨卷（新卷的第一章）
      const prevChapterInList = i > 0 ? chaptersToWrite[i - 1] : (startIndex > 0 ? sortedChapters[startIndex - 1] : null)
      const isNewVolume = prevChapterInList && prevChapterInList.volumeId !== chapter.volumeId

      // 构建跨卷上下文
      let volumeContext: VolumeTransitionContext | undefined
      if (isNewVolume && prevChapterInList) {
        console.log(`📚 [AutoWrite] 检测到跨卷：「${prevChapterInList.volumeName || '上一卷'}」→「${chapter.volumeName || '新卷'}」`)

        // 跨卷时强制更新摘要，确保新卷开始时有最新的剧情摘要
        if (recentChapters.length > 0) {
          try {
            storySummary = await generateStorySummary(
              storySummary,
              recentChapters.slice(-8),  // 取更多章节生成更详细的摘要
              characters,
              { triggerReason: 'new_arc', majorEvent: `开始新卷：${chapter.volumeName || '新卷'}` }
            )
            console.log(`✅ [AutoWrite] 跨卷时已更新全书摘要`)
            if (onSummaryUpdate) {
              await onSummaryUpdate(storySummary)
            }
            recentChapters.length = 0
          } catch (e) {
            console.warn('Failed to update summary at volume transition:', e)
          }
        }

        volumeContext = {
          isNewVolume: true,
          previousVolumeName: prevChapterInList.volumeName || `第${prevChapterInList.volumeOrder || 1}卷`,
          currentVolumeName: chapter.volumeName || `第${chapter.volumeOrder || 1}卷`,
          previousVolumeLastChapter: prevChapterInList.content || previousContent
        }
      }

      const content = await writeChapterStrict(
        worldSetting,
        characters,
        chapter.title,
        chapter.outline,
        previousContent,
        nextChapter?.outline || '',
        styles,
        targetWordCount,
        storySummary, // 传递剧情摘要
        volumeContext  // 传递跨卷上下文
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
    currentChapter: sortedChapters.length,  // 🔥 使用全书总章节数
    totalChapters: sortedChapters.length,   // 🔥 使用全书总章节数
    chapterTitle: '',
    status: 'complete'
  })

  return { completed, failed, totalWords }
}
