// 项目/书籍
export interface Project {
  id: string
  title: string
  author?: string           // 作者名（封面使用）
  inspiration: string
  constraints: string
  scale: 'micro' | 'million'
  genres: string[]
  styles: string[]
  worldSetting: string
  summary: string
  coverHistory?: string[]   // 封面历史记录（base64图片，最多保存5张）
  createdAt: string
  updatedAt: string
  syncedAt?: string
  version?: number          // 版本号，用于云同步时比较
}

// 卷
export interface Volume {
  id: string
  projectId: string
  title: string
  summary: string
  order: number
  // 本卷主线剧情（一句话概括）
  mainPlot?: string
  // 本卷关键事件列表（3-5个重要转折点）
  keyEvents?: string[]
  // 核心要点（3-5个关键事件/转折，用于全局一致性）
  keyPoints?: string[]  // 例如：["主角突破至金丹期", "击败血魔宗", "林雪牺牲"]
  // 简要章节框架（可选，用于两阶段生成）
  briefChapters?: Array<{
    chapterNumber: number
    briefOutline: string  // 20-30字的简要大纲
  }>
  createdAt: string
  updatedAt: string
}

// 章节
export interface Chapter {
  id: string
  volumeId: string
  title: string
  outline: string
  content: string
  wordCount: number
  order: number
  createdAt: string
  updatedAt: string
}

// 角色关系
export interface CharacterRelation {
  targetName: string      // 关系对象名
  relation: string        // 关系描述，如"师徒"、"仇敌"、"恋人"
}

// 角色
export interface Character {
  id: string
  projectId: string
  name: string
  role: 'protagonist' | 'supporting' | 'antagonist'
  gender: string
  age: string
  identity: string
  description: string
  arc: string
  status: 'active' | 'pending' | 'deceased'
  deathChapter?: string           // 死亡章节（如有）
  appearances: string[]           // 出现章节列表
  relationships: CharacterRelation[]  // 人物关系
  createdAt: string
  updatedAt: string
}

// 用户信息
export interface User {
  id: string
  email: string
  name: string
  picture: string
}

// 创作体量选项
export const SCALE_OPTIONS = [
  { value: 'micro', label: '微小说', description: '8章以内，每章2500字' },
  { value: 'million', label: '百万巨著', description: '12卷+，每卷40章+，每章2500字' }
] as const

// 题材标签（分类展示）
export const GENRE_CATEGORIES = {
  '幻想类': ['玄幻', '奇幻', '仙侠', '武侠', '末世', '灵异'],
  '现代类': ['都市', '现实', '职场', '官场', '校园', '医学', '娱乐圈'],
  '情感类': ['言情', '甜宠', '虐恋', '纯爱', '情色', '耽美', '百合', '豪门总裁'],
  '悬疑类': ['悬疑', '刑侦', '惊悚', '推理', '谍战'],
  '其他类': ['历史', '军事', '科幻', '游戏', '体育', '二次元', '轻小说'],
  '流派类': ['无限流', '系统流', '种田', '宫斗', '宅斗', '穿越', '重生', '年代文', '团宠萌宝', '快穿']
} as const

// 题材标签（扁平列表，用于选择器）
export const GENRE_OPTIONS = [
  // 幻想类
  '玄幻', '奇幻', '仙侠', '武侠', '末世', '灵异',
  // 现代类
  '都市', '现实', '职场', '官场', '校园', '医学', '娱乐圈',
  // 情感类
  '言情', '甜宠', '虐恋', '纯爱', '情色', '耽美', '百合', '豪门总裁',
  // 悬疑类
  '悬疑', '刑侦', '惊悚', '推理', '谍战',
  // 其他类
  '历史', '军事', '科幻', '游戏', '体育', '二次元', '轻小说',
  // 流派类
  '无限流', '系统流', '种田', '宫斗', '宅斗', '穿越', '重生', '年代文', '团宠萌宝', '快穿'
] as const

// 写作风格（简化版 - 核心风格维度）
export const STYLE_DIMENSIONS = {
  '基调': ['热血爽快', '轻松幽默', '沉稳厚重', '温馨治愈', '暗黑虐心'],
  '节奏': ['快节奏爽文', '稳健推进', '慢热细腻'],
  '结局': ['HE（圆满结局）', 'BE（悲剧结局）', '开放式结局']
} as const

// 题材对应的著名作者（用于风格参考）
// 风格描述需要具象化，方便AI在设计框架和写作时模仿
export const GENRE_AUTHORS: Record<string, { name: string; style: string; works: string }[]> = {
  // ===== 幻想类 =====
  '玄幻': [
    { name: '天蚕土豆', style: '废柴逆袭流开创者，擅长"打压-反打"的爽点循环，剧情围绕升级打脸展开，每个阶段必有小高潮，文风简洁直接，战斗描写燃爆热血，斗气等级体系清晰明了', works: '《斗破苍穹》《武动乾坤》《大主宰》' },
    { name: '辰东', style: '故事套故事的叙事结构，伏笔众多且埋线极深，人物心理描写细腻，代入感极强，擅长营造史诗级的宏大场景，文笔功底扎实，热血与悲壮并存', works: '《遮天》《完美世界》《圣墟》' },
    { name: '我吃西红柿', style: '世界观构建宏大华丽，修炼体系层次分明，叙事缓缓展开不烧脑，战斗画面描写清晰到位，风格大气磅礴，适合长线连载', works: '《盘龙》《星辰变》《吞噬星空》' },
    { name: '唐家三少', style: '学院流设定，等级架构清晰易懂，剧情以爱情/亲情/友情驱动，文风明快单纯，正能量满满，行云流水的故事推进，适合全年龄阅读', works: '《斗罗大陆》《神印王座》' }
  ],
  '奇幻': [
    { name: '爱潜水的乌贼', style: '世界观构建严谨完备，大量运用历史/神秘学资料，细节考究到物价风俗，群像塑造出色，擅长在克苏鲁式黑暗中保持温暖希望，反转精彩', works: '《诡秘之主》《奥术神座》' },
    { name: '猫腻', style: '文艺气质浓厚，人物塑造饱满立体，对话机锋幽默，细节描写出色，擅长在爽文框架中融入人文思考，节奏沉稳有深度', works: '《庆余年》《将夜》《择天记》' },
    { name: '烟雨江南', style: '文笔华丽而不堆砌，设定精巧独特，剧情紧凑不拖沓，擅长塑造亦正亦邪的复杂角色，黑暗风格中带有独特美感', works: '《亵渎》《尘缘》《永夜君王》' },
    { name: '烽火戏诸侯', style: '文笔极其优美，意境深远如水墨画，节奏沉稳厚重，擅长群像刻画和江湖百态，对白精炼有韵味', works: '《雪中悍刀行》《剑来》' }
  ],
  '仙侠': [
    { name: '耳根', style: '情感描写细腻动人，擅长在修仙框架中融入人情冷暖，主角多为逆境崛起的励志型，文笔优美有古韵，"逆"字贯穿作品精神，化凡情节感人至深', works: '《仙逆》《我欲封天》《一念永恒》' },
    { name: '忘语', style: '修仙体系设定严谨如百科全书，逻辑缜密自洽，擅长团灭爽点的独特设计，凡人流开创者，主角靠智慧和谨慎步步为营', works: '《凡人修仙传》《魔天记》' },
    { name: '净无痕', style: '节奏紧凑明快，升级体系合理清晰，打脸爽点密集，战斗描写热血激昂，适合追求爽感的读者', works: '《绝世武神》《太古神王》' },
    { name: '唐七公子', style: '仙侠言情代表，古风唯美意境，感情描写细腻婉转，擅长三生三世的浪漫架构', works: '《三生三世十里桃花》《华胥引》' },
    { name: 'Priest', style: '女频仙侠标杆，宏大世界观设定，人文思考深刻，擅长在仙侠框架中探讨女性成长', works: '《有匪》《杀破狼》' }
  ],
  '武侠': [
    { name: '金庸', style: '文笔典雅厚重，融合历史与虚构，人物塑造立体丰满，武功招式有章可循，家国情怀贯穿始终，情节跌宕起伏', works: '《射雕英雄传》《天龙八部》《笑傲江湖》' },
    { name: '古龙', style: '短句营造独特意境，对白精炼如诗，悬疑推理元素浓厚，擅长塑造浪子型主角，重意境轻招式，浪漫与孤独并存', works: '《多情剑客无情剑》《楚留香》《陆小凤》' },
    { name: '凤歌', style: '传统武侠正统传承，文笔流畅大气，江湖气息浓郁，武学体系完整，情节布局宏大', works: '《昆仑》《沧海》' }
  ],
  '末世': [
    { name: '绯炎', style: '末世生存氛围紧张压抑，人性刻画深刻真实，节奏紧凑不拖沓，擅长描写资源争夺和人心险恶', works: '《末世之黑暗召唤师》' },
    { name: '黑天魔神', style: '热血爽快的升级流，战斗描写精彩激烈，等级体系明确，在末世背景下依然保持爽文节奏', works: '《末世超级商人》' }
  ],
  '灵异': [
    { name: '狐尾的笔', style: '克苏鲁与中国民俗完美融合，傩戏/红绣鞋等本土元素营造中式恐怖，双重世界观设计精妙，在疯狂世界中坚守人性的主题深刻', works: '《道诡异仙》' },
    { name: '尾鱼', style: '志怪言情结合，悬疑开场风格惊悚，通过精彩故事推动感情升级，奇崛精彩中表达独特世界观', works: '《肉骨樊笼》《司藤》' },
    { name: '蜘蛛', style: '恐怖气氛渲染到位，案件设计离奇诡异，节奏紧张刺激，擅长心理恐怖描写', works: '《十宗罪》' }
  ],

  // ===== 现代类 =====
  '都市': [
    { name: '鱼人二代', style: '轻松搞笑的日常流，后宫元素处理得当，节奏轻快不沉重，对话幽默风趣，适合解压阅读', works: '《很纯很暧昧》《校花的贴身高手》' },
    { name: '柳下挥', style: '文笔流畅自然，情感描写真实动人，角色塑造鲜明立体，都市背景下的温情故事', works: '《天才医生》《逆鳞》' },
    { name: '辰东', style: '都市异能题材脑洞大开，将玄幻元素融入现代背景，剧情紧凑悬念不断', works: '《神墓》' },
    { name: '三九音域', style: '都市幻想风格，融合多国神话体系，以"灵魂角色"串联主线，热血与守护的精神内核，擅长群像塑造和少年感叙事', works: '《我在精神病院学斩神》《我不是戏神》' }
  ],
  '现实': [
    { name: '志鸟村', style: '行业细节考究专业，将真实职业生活融入小说，技术流写法，在专业性中展现人物成长', works: '《大医凌然》《国民法医》' },
    { name: '卓牧闲', style: '基层工作描写真实接地气，人物塑造朴实可信，在平凡岗位中展现不平凡', works: '《滨江警事》《朝阳警事》' }
  ],
  '职场': [
    { name: '御井烹香', style: '技术流言情，大量行业知识融入叙事，专业细节扎实，在职场背景下展开感情线', works: '《制霸好莱坞》《时尚大撕》' },
    { name: '何常在', style: '商战描写真实紧张，创业过程细节丰富，展现时代青年奋斗精神', works: '《浩荡》' }
  ],
  '官场': [
    { name: '小桥老树', style: '官场生态描写真实，人情世故刻画细腻，权谋博弈扣人心弦，文笔老练', works: '《侯卫东官场笔记》' },
    { name: '更俗', style: '商战政治交织，格局宏大，人物关系复杂，擅长多线叙事', works: '《枭臣》《大地产商》' }
  ],
  '校园': [
    { name: '一片雪饼', style: '真正的中式校园青春感，挑灯夜战的题海、篮球场的兄弟情，整体基调轻松诙谐，通过事件丰满人设，构筑真实感', works: '《我的超能力每周刷新》' },
    { name: '八月长安', style: '青春成长描写细腻，校园生活还原真实，情感表达含蓄动人，擅长捕捉少年心事', works: '《最好的我们》《你好，旧时光》' }
  ],
  '医学': [
    { name: '志鸟村', style: '医学知识专业严谨，手术场景描写紧张刺激，医院生态还原真实，主角成长线清晰', works: '《大医凌然》' },
    { name: '真熊初墨', style: '手术直播新颖设定，专业术语通俗化处理，节奏明快，医疗与爽文结合', works: '《手术直播间》' }
  ],

  // ===== 情感类 =====
  '言情': [
    { name: '顾漫', style: '甜宠风开创者，文风温馨轻快如日漫，俊男美女谈纯粹恋爱，完成度高，甜/爽/苏感俱全，适合解压', works: '《何以笙箫默》《微微一笑很倾城》' },
    { name: '桐华', style: '虐心深情派代表，剧情曲折跌宕，文笔优美有韵味，擅长前世今生/宫廷权谋背景下的爱情', works: '《步步惊心》《长相思》《曾许诺》' },
    { name: '墨宝非宝', style: '文笔细腻自然，感情发展水到渠成，擅长前世今生题材，温情中融入家国情怀', works: '《一生一世美人骨》《至此终年》' },
    { name: '唐七公子', style: '古风唯美意境，感情描写细腻婉转，擅长仙侠言情的浪漫氛围营造', works: '《三生三世十里桃花》《华胥引》' },
    { name: '玖月晞', style: '悬爱结合，文风细腻，擅长在悬疑背景下展开感情线，节奏紧凑', works: '《亲爱的弗洛伊德》《少年的你，如此美丽》' },
    { name: '青青绿萝裙', style: '大女主叙事，事业线与感情线并重，女主不依附男主的独立人设，文笔扎实', works: '《我妻薄情》《我有特殊沟通技巧》' }
  ],
  '甜宠': [
    { name: '顾漫', style: '甜宠文鼻祖，男主完美护短宠溺，女主独立可爱，全程高甜无虐，节奏轻快治愈', works: '《微微一笑很倾城》《你是我的荣耀》' },
    { name: '叶斐然', style: '轻松甜蜜的恋爱日常，互动有趣不尬，人设讨喜，纯粹的恋爱糖分', works: '《国民老公带回家》' },
    { name: '酒小七', style: '宠溺甜文代表，男女主互动自然有爱，竞技/职场背景融入言情，文风温暖治愈', works: '《冰糖炖雪梨》《浪花一朵朵》《萌医甜妻》' }
  ],
  '虐恋': [
    { name: '桐华', style: '虐心大师，感情纠葛复杂深刻，擅长制造误会与遗憾，BE或HE都能虐到心坎', works: '《步步惊心》《那些回不去的年少时光》' },
    { name: '匪我思存', style: '民国/现代虐恋专家，文笔细腻伤感，悲剧美学运用到极致，让人哭到心碎', works: '《来不及说爱你》《佳期如梦》' }
  ],
  '纯爱': [
    { name: 'Priest', style: '正剧向为主，语言幽默中带沉重现实，擅长长句叙事如史书般厚重，不避讳社会问题，人物趋向伟光正，题材多变涵盖玄幻武侠科幻', works: '《默读》《杀破狼》《镇魂》《有匪》' },
    { name: '木苏里', style: '文风诙谐简练，擅长在宏大背景中保留生活烟火气，感情线随剧情自然推进，涉猎题材广泛包括无限流/校园/仙侠，人物充满生活气息', works: '《全球高考》《某某》《铜钱龛世》《判官》' },
    { name: '墨香铜臭', style: '每个副本如短篇小说般完整，剧情精彩反转多，人物塑造鲜明，感情线虐中带甜', works: '《魔道祖师》《天官赐福》' },
    { name: '淮上', style: '文字浓墨重彩，情感表达强烈，氛围感营造出色', works: '《破云》《犯罪心理》' }
  ],
  '耽美': [
    { name: 'Priest', style: '正剧向BL，语言平实中有幽默深沉，不避讳现实问题，擅长塑造有担当的角色', works: '《默读》《杀破狼》《残次品》' },
    { name: '墨香铜臭', style: '剧情精彩副本丰富，人物群像出色，感情线自然不突兀', works: '《魔道祖师》《天官赐福》《人渣反派自救系统》' }
  ],
  '百合': [
    { name: '纯白阡陌', style: '百合文笔细腻，情感描写真挚动人，女性角色塑造立体', works: '《她们的故事》' }
  ],

  // ===== 悬疑类 =====
  '悬疑': [
    { name: '紫金陈', style: '逻辑严密无漏洞，反转设计精彩震撼，人性刻画深刻入骨，社会派推理代表', works: '《无证之罪》《隐秘的角落》《坏小孩》' },
    { name: '周浩晖', style: '悬念层层递进，推理过程缜密，结局往往出人意料又合情合理', works: '《死亡通知单》' },
    { name: '雷米', style: '犯罪心理学专业背景，案件设计变态诡异，心理描写深入骨髓', works: '《心理罪》' }
  ],
  '刑侦': [
    { name: '紫金陈', style: '刑侦程序描写专业，社会问题挖掘深刻，人物动机合理复杂', works: '《无证之罪》《长夜难明》' },
    { name: '雷米', style: '犯罪心理分析专业，破案过程严谨，黑暗人性展现到位', works: '《心理罪》' }
  ],
  '惊悚': [
    { name: '蜘蛛', style: '恐怖气氛渲染极致，案件设计诡异猎奇，心理惊悚效果出色', works: '《十宗罪》' },
    { name: '杀虫队队员', style: '规则怪谈与无限流结合，脑洞大开环环相扣，叙事穿插跳跃灵动，人物小传特色鲜明，草蛇灰线埋线众多', works: '《十日终焉》《传说管理局》' },
    { name: '夜来风雨声丶', style: '无限流微惊悚风格，副本设计融合中式民俗恐怖元素，世界观层层反转，群像塑造立体，"火盆夜话"式沉浸叙事', works: '《诡舍》' }
  ],
  '推理': [
    { name: '周浩晖', style: '本格推理功底扎实，逻辑推演严密，布局精巧', works: '《死亡通知单》' },
    { name: '紫金陈', style: '社会派推理代表，案件背后揭示社会问题，人性刻画深刻', works: '《无证之罪》《隐秘的角落》' }
  ],
  '谍战': [
    { name: '麦家', style: '谍战文学开创者，情节紧张悬疑，人物内心刻画深刻，文学性与可读性兼具', works: '《暗算》《风声》《解密》' }
  ],

  // ===== 其他类 =====
  '历史': [
    { name: '月关', style: '历史考据严谨，权谋博弈烧脑精彩，文笔老练流畅，爽文节奏在历史框架中展开', works: '《回到明朝当王爷》《锦衣夜行》' },
    { name: '孑与2', style: '历史厚重感强，人物塑造鲜活立体，格局宏大磅礴', works: '《唐砖》《银狐》《汉乡》' },
    { name: '贼道三痴', style: '文风典雅有古韵，历史细节还原考究，擅长魏晋南北朝背景', works: '《上品寒士》' },
    { name: '愤怒的香蕉', style: '文笔细腻有深度，人物成长描写真实，历史与架空结合自然', works: '《赘婿》' }
  ],
  '军事': [
    { name: '海中之虎', style: '战争场面描写娴熟震撼，史诗感强烈，军事细节专业，让人热血沸腾', works: '《浴血半岛》' },
    { name: '骁骑校', style: '军旅生活描写真实，战斗场景紧张刺激，兄弟情义感人', works: '《橙红年代》' }
  ],
  '科幻': [
    { name: '刘慈欣', style: '硬核科幻代表，想象力宏大瑰丽，物理学设定严谨，哲学思考深刻，宇宙尺度的叙事', works: '《三体》《流浪地球》《球状闪电》' },
    { name: '天瑞说符', style: '脑洞大开新奇有趣，科学逻辑自洽，节奏明快不沉闷，轻松向科幻', works: '《死在火星上》《我们生活在南京》' },
    { name: '王晋康', style: '人文科幻代表，思想深邃关怀人类命运，科学设定严谨', works: '《生命之歌》《蚁生》' }
  ],
  '游戏': [
    { name: '蝴蝶蓝', style: '电竞/网游题材开创者，热血竞技氛围浓厚，团队协作描写出色，节奏明快激昂，专业术语处理得当', works: '《全职高手》' },
    { name: '失落叶', style: '游戏设定有趣新颖，升级系统清晰，风格轻松幽默', works: '《网游之近战法师》' }
  ],
  '体育': [
    { name: '林海听涛', style: '足球专业知识丰富，比赛场面描写紧张刺激，竞技精神展现到位', works: '《我们是冠军》《禁区之雄》' }
  ],
  '二次元': [
    { name: '远瞳', style: '设定新颖脑洞大，融合克苏鲁与二次元元素，世界观构建完整，文风轻松有趣', works: '《异常生物见闻录》《黎明之剑》' }
  ],
  '轻小说': [
    { name: '国王陛下', style: '轻松搞笑的日常流，后宫元素处理自然，对话幽默风趣，适合解压阅读', works: '《从前有座灵剑山》' }
  ],

  // ===== 流派类 =====
  '无限流': [
    { name: 'zhttty', style: '无限流开创者，"主神空间"模式奠基人，系统+场景+人物的经典框架，副本世界多元', works: '《无限恐怖》' },
    { name: '卷土', style: '数据无限流代表，用严谨数字展现场面，战斗系统完整', works: '《王牌进化》' },
    { name: '三天两觉', style: '无限流与网游结合，设定新颖有趣，节奏明快', works: '《惊悚乐园》' },
    { name: '杀虫队队员', style: '类型融合高手，国风元素融入博弈游戏，叙事穿插跳跃，人物小传特色鲜明，副本间草蛇灰线，无法跳读的烧脑作品', works: '《十日终焉》《传说管理局》' },
    { name: '木苏里', style: '无限流与纯爱结合，设定新颖脑洞大，感情线随剧情自然推进，文笔诙谐简练', works: '《全球高考》' }
  ],
  '系统流': [
    { name: '会说话的肘子', style: '系统设定新颖搞笑，主角性格独特有趣，节奏轻快爽感十足，对话幽默', works: '《大王饶命》《第一序列》' }
  ],
  '种田': [
    { name: '吱吱', style: '种田文/宅斗文代表，历史细节考究严谨，家长里短写得温馨有趣，感情描写平和真实', works: '《庶女攻略》《九重紫》《金陵春》' },
    { name: '闲听落花', style: '古代经商种田，商业逻辑合理，生活细节丰富，节奏平和治愈', works: '《花开锦绣》' },
    { name: '我想吃肉', style: '古代种田大女主，历史功底扎实，女主不靠爱情靠事业，文风轻快活泼', works: '《祝姑娘今天掉坑了没》《诗酒趁年华》《佳人在侧》' }
  ],
  '宫斗': [
    { name: '流潋紫', style: '后宫争斗描写精彩，人物心机刻画细腻，对白机锋暗藏玄机，氛围营造到位', works: '《甄嬛传》《如懿传》' },
    { name: '卿隐', style: '宫廷权谋描写真实，从宫女到贵妃的逆袭路线清晰，人心博弈精彩', works: '《皇贵妃》' },
    { name: '千山茶客', style: '聪慧狠辣女主设定，复仇虐渣情节精彩，文笔老练节奏紧凑', works: '《灯花笑》《皎皎》' }
  ],
  '宅斗': [
    { name: '吱吱', style: '宅斗文里程碑作者，庶女逆袭路线清晰，家族矛盾描写真实，古代家庭生态还原到位', works: '《庶女攻略》《知否知否应是绿肥红瘦》' },
    { name: '关心则乱', style: '宅斗描写细腻真实，人物性格立体，家庭关系复杂有层次', works: '《知否知否应是绿肥红瘦》' },
    { name: '我想吃肉', style: '女强风格，女主清醒飒爽，历史考据扎实，轻快幽默的文风，擅长无CP大女主', works: '《祝姑娘今天掉坑了没》《凤还巢》《女户》' }
  ],
  '穿越': [
    { name: '月关', style: '穿越历史爽文代表，权谋与美人兼得，节奏明快爽点密集', works: '《回到明朝当王爷》《步步生莲》' },
    { name: '桐华', style: '穿越言情代表，感情描写细腻虐心，历史背景融合自然', works: '《步步惊心》' },
    { name: '希行', style: '穿越重生女频代表，"爽而不俗"，主角带着时间差优势向死而生', works: '《名门医女》《重生之药香》' }
  ],
  '重生': [
    { name: '猫腻', style: '重生架空历史代表，文艺气质与爽文结合，人物塑造饱满，思想内涵丰富', works: '《庆余年》' },
    { name: '希行', style: '女频重生代表，跌落谷底后逆袭，靠智慧和技能翻身', works: '《名门医女》《娇娘医经》' },
    { name: '愤怒的香蕉', style: '赘婿重生流代表，从商业到政治的全方位逆袭，文笔细腻有深度', works: '《赘婿》' }
  ],

  // ===== 新增女频/番茄热门类型 =====
  '娱乐圈': [
    { name: '御井烹香', style: '技术流娱乐圈文，大量行业知识融入叙事，专业细节扎实，女主事业线精彩', works: '《制霸好莱坞》《时尚大撕》' },
    { name: '西子绪', style: '娱乐圈背景下的悬疑推理，文风幽默犀利，剧情紧凑反转精彩', works: '《死亡万花筒》《撒野》' },
    { name: '巫哲', style: '娱乐圈甜宠代表，互动有趣自然，人物鲜活立体，文风轻快', works: '《撒野》《解药》' }
  ],
  '豪门总裁': [
    { name: '顾漫', style: '现代言情鼻祖，俊男美女谈纯粹恋爱，甜宠感满满，完成度高', works: '《何以笙箫默》《你是我的荣耀》' },
    { name: '墨西柯', style: '爽文向豪门世家，真千金逆袭路线，节奏明快打脸爽点密集', works: '《真千金懒得理你》' },
    { name: '叶非夜', style: '总裁文代表作者，男主霸道深情，女主独立可爱，全程高甜', works: '《亿万老婆买一送一》《国民校草是女生》' }
  ],
  '年代文': [
    { name: '轻侯', style: '年代文考据严谨，六零七零背景还原真实，专业知识融入故事，主角凭技能逆袭', works: '《草原牧医[六零]》' },
    { name: '报纸糊墙', style: '年代种田风格，生活细节丰富，家长里短写得温馨有趣，节奏平和治愈', works: '《我在八零年代当后妈》' },
    { name: '御井烹香', style: '年代背景下的女性成长，事业线与感情线并重，人物塑造真实立体', works: '《六零之穿成极品他妈》' }
  ],
  '团宠萌宝': [
    { name: '六月是一只猫', style: '团宠文代表，萌宝人设讨喜，家庭温馨治愈，节奏轻快解压', works: '《团宠郡主小暖宝》' },
    { name: '一夕烟雨', style: '古代背景团宠文，文风温馨甜蜜，家族互动有爱，女主成长励志', works: '《烟雨楼》' }
  ],
  '快穿': [
    { name: '糖果淼淼', style: '快穿甜宠风格，各世界设定丰富多样，女主人设讨喜，任务与感情线结合自然', works: '《快穿之女配逆袭记》' },
    { name: '宿星川', style: '创作题材丰富，吐槽玩梗脑洞大，反套路设计精妙，涉及无限流/惊悚/穿越多种类型', works: '《穿成师尊，但开组会》' },
    { name: '桉柏', style: '赛博朋克与克苏鲁元素融合，设定丰富节奏明快，战斗激烈反转频频，爽感强烈', works: '《穿进赛博游戏后干掉BOSS成功上位》' }
  ]
}

// 获取题材对应的推荐作者
export function getAuthorsForGenres(genres: string[]): { name: string; style: string; works: string }[] {
  const authors: { name: string; style: string; works: string }[] = []
  const seen = new Set<string>()

  for (const genre of genres) {
    const genreAuthors = GENRE_AUTHORS[genre] || []
    for (const author of genreAuthors) {
      if (!seen.has(author.name)) {
        seen.add(author.name)
        authors.push(author)
      }
    }
  }

  return authors.slice(0, 8) // 最多返回8位作者
}

// 旧版写作风格（保留兼容性）
export const STYLE_CATEGORIES = {
  '情绪基调': ['热血', '轻松', '搞笑', '虐心', '治愈', '暗黑', '沉重', '温馨'],
  '节奏风格': ['爽文', '慢热', '快节奏', '日常', '紧张刺激'],
  '文笔特点': ['文艺', '细腻', '大气', '幽默', '辛辣', '华丽', '朴实'],
  '情感倾向': ['甜蜜', '禁忌', '撩人', '纯情', 'BE向', 'HE向', '开放式'],
  '题材风格': ['权谋烧脑', '硬核', '软萌', '废土风', '赛博朋克', '古风', '现代感']
} as const

// 写作风格（扁平列表，用于选择器）
export const STYLE_OPTIONS = [
  // 情绪基调
  '热血', '轻松', '搞笑', '虐心', '治愈', '暗黑', '沉重', '温馨',
  // 节奏风格
  '爽文', '慢热', '快节奏', '日常', '紧张刺激',
  // 文笔特点
  '文艺', '细腻', '大气', '幽默', '辛辣', '华丽', '朴实',
  // 情感倾向
  '甜蜜', '禁忌', '撩人', '纯情', 'BE向', 'HE向', '开放式',
  // 题材风格
  '权谋烧脑', '硬核', '软萌', '废土风', '赛博朋克', '古风', '现代感'
] as const

// 服务端用户信息
export interface ServerUser {
  id: string
  googleId?: string
  email: string
  name?: string
  picture?: string
  status: 'pending' | 'approved' | 'rejected' | 'suspended'
  role: 'user' | 'admin'
  createdAt: string
  lastLoginAt?: string
}

// 服务端认证令牌
export interface AuthTokens {
  accessToken: string
  refreshToken: string
  expiresIn: number
  expiresAt: number
}

// Electron API 类型 (从 preload 导出)
export interface ElectronAPI {
  window: {
    minimize: () => void
    maximize: () => void
    close: () => void
  }

  auth: {
    login: () => Promise<{ success: boolean; user?: User; error?: string }>
    logout: () => Promise<void>
    getUser: () => Promise<User | null>
    isLoggedIn: () => Promise<boolean>
  }

  drive: {
    sync: () => Promise<{ success: boolean; error?: string }>
    upload: (data: any) => Promise<{ success: boolean; fileId?: string; error?: string }>
    download: (fileId: string) => Promise<{ success: boolean; data?: any; error?: string }>
    list: () => Promise<{ success: boolean; files?: any[]; error?: string }>
    restore: () => Promise<{ success: boolean; importedCount?: number; errors?: string[]; error?: string }>
  }

  // 服务端认证
  serverAuth: {
    login: () => Promise<{ success: boolean; user?: ServerUser; tokens?: AuthTokens; error?: string }>
    logout: () => Promise<void>
    getUser: () => Promise<ServerUser | null>
    isLoggedIn: () => Promise<boolean>
    checkUserStatus: () => Promise<{ isApproved: boolean; status: string; message?: string }>
    refreshToken: () => Promise<{ success: boolean; tokens?: AuthTokens; error?: string }>
    getAccessToken: () => Promise<string | null>
    getTokens: () => Promise<AuthTokens | null>
    setServerUrl: (url: string) => Promise<void>
    getServerUrl: () => Promise<string>
    testConnection: (url?: string) => Promise<{ success: boolean; data?: any; error?: string }>
  }

  // 服务端同步
  serverSync: {
    sync: () => Promise<{ success: boolean; uploaded?: number; downloaded?: number; conflicts?: number; errors?: string[]; error?: string }>
    uploadProject: (projectId: string) => Promise<{ success: boolean; error?: string }>
    batchUpload: (projectIds: string[]) => Promise<{ success: boolean; uploaded?: number; errors?: string[]; error?: string }>
    restore: () => Promise<{ success: boolean; importedCount?: number; errors?: string[]; error?: string }>
  }

  // 服务端管理员
  serverAdmin: {
    listUsers: (params?: { status?: string; page?: number; limit?: number }) => Promise<{ success: boolean; users?: any[]; pagination?: any; error?: string }>
    getStats: () => Promise<{ success: boolean; stats?: any; error?: string }>
    approveUser: (userId: string) => Promise<{ success: boolean; user?: any; error?: string }>
    rejectUser: (userId: string, reason?: string) => Promise<{ success: boolean; user?: any; error?: string }>
    suspendUser: (userId: string, reason?: string) => Promise<{ success: boolean; user?: any; error?: string }>
    batchApprove: (userIds: string[]) => Promise<{ success: boolean; approved?: number; failed?: number; results?: any[]; error?: string }>
  }

  db: {
    getProjects: () => Promise<Project[]>
    getProject: (id: string) => Promise<Project | null>
    createProject: (project: Partial<Project>) => Promise<Project>
    updateProject: (id: string, data: Partial<Project>) => Promise<Project>
    deleteProject: (id: string) => Promise<void>
    importProject: (data: any, options?: any) => Promise<{ success: boolean; projectId?: string; error?: string }>
    exportProject: (projectId: string) => Promise<any>

    getVolumes: (projectId: string) => Promise<Volume[]>
    createVolume: (volume: Partial<Volume>) => Promise<Volume>
    updateVolume: (id: string, data: Partial<Volume>) => Promise<Volume>
    deleteVolume: (id: string) => Promise<void>
    trySetGeneratingLock: (volumeId: string) => Promise<{ success: boolean; lockedAt?: number; lockedMinutesAgo?: number }>
    clearGeneratingLock: (volumeId: string) => Promise<void>
    checkGeneratingLock: (volumeId: string) => Promise<{ isLocked: boolean; lockedAt?: number; lockedMinutesAgo?: number }>

    getChapters: (volumeId: string) => Promise<Chapter[]>
    getChapter: (id: string) => Promise<Chapter | null>
    createChapter: (chapter: Partial<Chapter>) => Promise<Chapter>
    updateChapter: (id: string, data: Partial<Chapter>) => Promise<Chapter>
    deleteChapter: (id: string) => Promise<void>

    getCharacters: (projectId: string) => Promise<Character[]>
    getCharacter: (id: string) => Promise<Character | null>
    createCharacter: (character: Partial<Character>) => Promise<Character>
    updateCharacter: (id: string, data: Partial<Character>) => Promise<Character>
    deleteCharacter: (id: string) => Promise<void>
  }

  settings: {
    get: (key: string) => Promise<any>
    set: (key: string, value: any) => Promise<void>
    getAll: () => Promise<Record<string, any>>
  }

  system: {
    getAppVersion: () => Promise<string>
    openExternal: (url: string) => void
  }

  // AI API 请求（通过主进程代理）
  ai: {
    fetch: (url: string, options: {
      method: string
      headers: Record<string, string>
      body?: string
    }) => Promise<{ ok: boolean; status: number; data: any; error?: string }>
  }
}

declare global {
  interface Window {
    electron: ElectronAPI
  }
}
