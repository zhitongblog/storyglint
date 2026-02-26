import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Card, Input, Button, Radio, Checkbox, message, Spin, Steps, Progress, Tag } from 'antd'
import {
  RocketOutlined,
  BulbOutlined,
  ThunderboltOutlined,
  GlobalOutlined,
  TeamOutlined,
  OrderedListOutlined,
  CheckCircleOutlined,
  ReloadOutlined,
  UserOutlined
} from '@ant-design/icons'
import { useProjectStore } from '../../stores/project'
import { SCALE_OPTIONS, GENRE_CATEGORIES, getAuthorsForGenres } from '../../types'
import { autoCreateNovel } from '../../services/auto-create'
import { isGeminiReady, initGemini, generateBookTitle } from '../../services/gemini'
import { ErrorPage, parseError, type ErrorInfo } from '../../components/ErrorDisplay'
type CheckboxValueType = string | number | boolean

const { TextArea } = Input

type CreateStep = 'input' | 'generating' | 'done' | 'error'
type GeneratePhase = 'init' | 'world' | 'characters' | 'outline' | 'saving' | 'complete'

function Home() {
  const navigate = useNavigate()
  const {
    createProject,
    createVolume,
    createChapter,
    createCharacter
  } = useProjectStore()

  const [step, setStep] = useState<CreateStep>('input')
  const [phase, setPhase] = useState<GeneratePhase>('init')
  const [progress, setProgress] = useState(0)
  const [progressMessage, setProgressMessage] = useState('')
  const [errorInfo, setErrorInfo] = useState<ErrorInfo | null>(null)

  const [formData, setFormData] = useState({
    title: '',
    inspiration: '',
    constraints: '',
    scale: 'micro' as 'micro' | 'million',
    genres: [] as string[],
    styles: [] as string[],
    selectedAuthors: [] as string[]  // 选中的参考作者
  })

  // 根据选中的题材获取推荐作者
  const recommendedAuthors = useMemo(() => {
    return getAuthorsForGenres(formData.genres)
  }, [formData.genres])

  // 书名生成状态
  const [isGeneratingTitle, setIsGeneratingTitle] = useState(false)
  const [titleSuggestions, setTitleSuggestions] = useState<string[]>([])

  // 获取当前配置的 API Key
  const getConfiguredApiKey = async (): Promise<string | null> => {
    const provider = await window.electron.settings.get('aiProvider') as string
    const configs = await window.electron.settings.get('aiProviderConfigs') as Record<string, { apiKey: string; model: string }> | null

    if (configs && provider && configs[provider]?.apiKey) {
      return configs[provider].apiKey
    }
    // 向后兼容：尝试旧的 geminiApiKey
    const oldKey = await window.electron.settings.get('geminiApiKey') as string | null
    return oldKey || null
  }

  // AI 生成书名
  const handleGenerateTitle = async () => {
    if (!formData.inspiration.trim()) {
      message.warning('请先输入核心灵感')
      return
    }

    const apiKey = await getConfiguredApiKey()
    if (!apiKey) {
      message.error('请先在全局设置中配置 API Key')
      return
    }

    if (!isGeminiReady()) {
      await initGemini(apiKey)
    }

    setIsGeneratingTitle(true)
    try {
      const titles = await generateBookTitle(formData.inspiration, formData.genres, 5)
      if (titles.length > 0) {
        setTitleSuggestions(titles)
        // 自动选择第一个
        setFormData({ ...formData, title: titles[0] })
        message.success('书名生成成功，点击可切换其他建议')
      } else {
        message.warning('未能生成书名，请稍后重试')
      }
    } catch (error: any) {
      message.error(error.message || '生成书名失败')
    } finally {
      setIsGeneratingTitle(false)
    }
  }

  // 选择建议的书名
  const handleSelectTitle = (title: string) => {
    setFormData({ ...formData, title })
  }

  const handleGenreChange = (checkedValues: CheckboxValueType[]) => {
    // 题材改变时，清空已选作者（因为推荐作者会变化）
    setFormData({ ...formData, genres: checkedValues as string[], selectedAuthors: [], styles: [] })
  }

  // 选择/取消选择作者
  const handleAuthorSelect = (authorName: string, authorStyle: string) => {
    const currentSelected = formData.selectedAuthors
    const currentStyles = formData.styles

    if (currentSelected.includes(authorName)) {
      // 取消选择
      setFormData({
        ...formData,
        selectedAuthors: currentSelected.filter(a => a !== authorName),
        styles: currentStyles.filter(s => s !== authorStyle)
      })
    } else if (currentSelected.length < 2) {
      // 最多选择2位作者
      setFormData({
        ...formData,
        selectedAuthors: [...currentSelected, authorName],
        styles: [...currentStyles, authorStyle]
      })
    } else {
      message.warning('最多选择2位参考作者')
    }
  }

  const handleSubmit = async () => {
    if (!formData.inspiration.trim()) {
      message.warning('请输入你的核心灵感')
      return
    }

    // 检查 AI API
    const apiKey = await getConfiguredApiKey()
    if (!apiKey) {
      message.error('请先在全局设置中配置 API Key')
      navigate('/settings')
      return
    }

    if (!isGeminiReady()) {
      await initGemini(apiKey)
    }

    setStep('generating')
    setPhase('init')
    setProgress(5)

    try {
      // 创建项目
      setPhase('world')
      setProgress(10)
      setProgressMessage('正在构建世界观...')

      // 调用 AI 生成完整框架（百万巨著会分步生成）
      const result = await autoCreateNovel(
        formData.inspiration,
        formData.constraints,
        formData.scale,
        formData.genres,
        formData.styles,
        (phase, progressValue, msg) => {
          setProgress(progressValue)
          setProgressMessage(msg)
          if (phase === 'chapters') {
            setPhase('outline')
          }
        }
      )

      setPhase('characters')
      setProgress(50)
      setProgressMessage('正在保存角色数据...')

      // 创建项目记录
      const project = await createProject({
        title: formData.title || generateTitle(formData.inspiration),
        inspiration: formData.inspiration,
        constraints: formData.constraints,
        scale: formData.scale,
        genres: formData.genres,
        styles: formData.styles,
        worldSetting: result.worldSetting
      })

      if (!project) {
        throw new Error('创建项目失败')
      }

      // 创建角色
      setProgressMessage('正在保存角色数据...')
      for (const char of result.characters) {
        await createCharacter({
          projectId: project.id,
          ...char
        })
      }

      // 创建卷结构
      setPhase('saving')
      const totalVolumes = result.volumes.length
      const isMicroNovel = formData.scale === 'micro'
      let totalChaptersCreated = 0

      for (let i = 0; i < result.volumes.length; i++) {
        const vol = result.volumes[i]
        setProgressMessage(`正在保存第${i + 1}/${totalVolumes}卷结构...`)

        const volume = await createVolume({
          projectId: project.id,
          title: vol.title,
          summary: vol.summary
        })

        // 微小说：直接保存章节大纲（无需手动生成）
        if (isMicroNovel && vol.chapters && vol.chapters.length > 0 && volume) {
          setProgressMessage(`正在保存章节大纲...`)
          for (let j = 0; j < vol.chapters.length; j++) {
            const ch = vol.chapters[j]
            await createChapter({
              volumeId: volume.id,
              title: ch.title,
              outline: ch.outline,
              content: ''
            })
            totalChaptersCreated++
          }
        }

        setProgress(50 + Math.floor(((i + 1) / totalVolumes) * 45))
      }

      setProgressMessage('保存完成！')
      setProgress(100)
      setPhase('complete')
      setStep('done')

      if (isMicroNovel && totalChaptersCreated > 0) {
        message.success(`创作框架生成完成！共${totalChaptersCreated}章，可直接开始写作`)
      } else {
        message.success(`创作框架生成完成！共${totalVolumes}卷，请在大纲页面生成各卷章节`)
      }

      // 跳转到编辑页面
      setTimeout(() => {
        navigate(`/project/${project.id}/editor`)
      }, 1500)

    } catch (error: any) {
      console.error('Auto create error:', error)
      const parsedError = parseError(error)
      parsedError.title = '大纲生成失败'
      // 添加针对大纲生成的特定建议
      if (!parsedError.suggestions) {
        parsedError.suggestions = []
      }
      parsedError.suggestions.unshift('检查灵感描述是否足够详细')
      parsedError.suggestions.unshift('确保 Gemini API Key 配置正确')
      setErrorInfo(parsedError)
      setStep('error')
      setProgressMessage('')
    }
  }

  // 从灵感中提取标题
  const generateTitle = (inspiration: string): string => {
    // 简单提取前几个字作为临时标题
    const clean = inspiration.replace(/[，。！？、]/g, ' ').trim()
    const words = clean.split(/\s+/).slice(0, 4).join('')
    return words.slice(0, 10) || `新作品 ${new Date().toLocaleDateString()}`
  }

  const getPhaseText = () => {
    if (progressMessage) return progressMessage
    switch (phase) {
      case 'init': return '准备中...'
      case 'world': return '正在构建世界观...'
      case 'characters': return '正在塑造角色...'
      case 'outline': return '正在规划大纲...'
      case 'saving': return '正在保存...'
      case 'complete': return '创作完成！'
      default: return '处理中...'
    }
  }

  // 错误页面
  if (step === 'error' && errorInfo) {
    return (
      <ErrorPage
        error={errorInfo}
        onRetry={() => {
          setErrorInfo(null)
          setStep('input')
        }}
        onDismiss={() => {
          setErrorInfo(null)
          setStep('input')
        }}
        retryText="返回修改"
        dismissText="关闭"
      />
    )
  }

  // 生成中页面
  if (step === 'generating' || step === 'done') {
    return (
      <div className="min-h-full p-6 flex items-center justify-center">
        <Card
          className="w-full max-w-lg text-center"
          style={{ background: '#16213e', border: '1px solid #0f3460' }}
        >
          <div className="py-8">
            {step === 'done' ? (
              <CheckCircleOutlined className="text-6xl text-green-500 mb-6" />
            ) : (
              <Spin size="large" className="mb-6" />
            )}

            <h2 className="text-2xl font-bold text-dark-text mb-4">
              {step === 'done' ? '创作框架已生成！' : 'AI 正在为你创作...'}
            </h2>

            <Progress
              percent={progress}
              status={step === 'done' ? 'success' : 'active'}
              strokeColor={{
                '0%': '#0ea5e9',
                '100%': '#0284c7'
              }}
              className="mb-6"
            />

            <Steps
              current={
                phase === 'init' ? 0 :
                phase === 'world' ? 1 :
                phase === 'characters' ? 2 :
                phase === 'outline' ? 3 :
                4
              }
              size="small"
              className="mb-6"
              items={[
                { title: '初始化', icon: <BulbOutlined /> },
                { title: '世界观', icon: <GlobalOutlined /> },
                { title: '角色', icon: <TeamOutlined /> },
                { title: '大纲', icon: <OrderedListOutlined /> },
                { title: '完成', icon: <CheckCircleOutlined /> }
              ]}
            />

            <p className="text-dark-muted">{getPhaseText()}</p>

            {step === 'done' && (
              <p className="text-primary-400 mt-4">即将跳转到编辑器...</p>
            )}
          </div>
        </Card>
      </div>
    )
  }

  return (
    <div className="min-h-full p-6 fade-in">
      <div className="max-w-4xl mx-auto">
        {/* 头部 */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary-500/20 mb-4">
            <BulbOutlined className="text-3xl text-primary-400" />
          </div>
          <h1 className="text-3xl font-bold text-dark-text mb-2">开启你的创作之旅</h1>
          <p className="text-dark-muted">输入灵感，AI 将自动生成世界观、角色、完整大纲</p>
        </div>

        {/* 表单 */}
        <Card
          className="mb-6"
          style={{ background: '#16213e', border: '1px solid #0f3460' }}
        >
          {/* 作品名称 */}
          <div className="mb-6">
            <label className="block text-dark-text mb-2 font-medium">作品名称</label>
            <div className="flex gap-2">
              <Input
                size="large"
                placeholder="输入书名或点击右侧按钮AI生成..."
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                className="custom-input flex-1"
              />
              <Button
                size="large"
                icon={<ReloadOutlined spin={isGeneratingTitle} />}
                onClick={handleGenerateTitle}
                loading={isGeneratingTitle}
                disabled={!formData.inspiration.trim()}
              >
                AI生成
              </Button>
            </div>
            {/* 书名建议列表 */}
            {titleSuggestions.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-2">
                {titleSuggestions.map((title, index) => (
                  <span
                    key={index}
                    className={`px-3 py-1 rounded-full text-sm cursor-pointer transition-colors ${
                      formData.title === title
                        ? 'bg-primary-500 text-white'
                        : 'bg-dark-bg text-dark-muted hover:bg-primary-500/30 hover:text-dark-text'
                    }`}
                    onClick={() => handleSelectTitle(title)}
                  >
                    {title}
                  </span>
                ))}
              </div>
            )}
            {!titleSuggestions.length && (
              <p className="text-dark-muted text-xs mt-1">
                输入灵感后点击"AI生成"可获取书名建议
              </p>
            )}
          </div>

          {/* 核心灵感 */}
          <div className="mb-6">
            <label className="block text-dark-text mb-2 font-medium">
              <ThunderboltOutlined className="mr-2 text-yellow-400" />
              核心灵感 *
            </label>
            <TextArea
              rows={4}
              placeholder="描述你的核心创意，越详细越好。例如：&#10;&#10;一个普通高中生偶然获得了可以看透人心的能力，却发现自己的父亲隐藏着惊天的秘密。他必须在亲情与正义之间做出选择，同时还要面对同样拥有异能的神秘组织的追杀..."
              value={formData.inspiration}
              onChange={(e) => setFormData({ ...formData, inspiration: e.target.value })}
              className="custom-input"
              showCount
              maxLength={2000}
            />
          </div>

          {/* 额外约束 */}
          <div className="mb-6">
            <label className="block text-dark-text mb-2 font-medium">额外约束（可选）</label>
            <TextArea
              rows={2}
              placeholder="添加任何创作约束，例如：主角必须是女性、不要出现穿越元素、参考《斗破苍穹》的升级体系..."
              value={formData.constraints}
              onChange={(e) => setFormData({ ...formData, constraints: e.target.value })}
              className="custom-input"
            />
          </div>

          {/* 创作体量 */}
          <div className="mb-6">
            <label className="block text-dark-text mb-3 font-medium">创作体量</label>
            <Radio.Group
              value={formData.scale}
              onChange={(e) => setFormData({ ...formData, scale: e.target.value })}
              className="w-full"
            >
              <div className="grid grid-cols-2 gap-4">
                {SCALE_OPTIONS.map((option) => (
                  <Radio.Button
                    key={option.value}
                    value={option.value}
                    className="h-auto py-3 text-center"
                    style={{
                      background:
                        formData.scale === option.value
                          ? 'linear-gradient(135deg, #0ea5e9 0%, #0284c7 100%)'
                          : '#0f0f1a',
                      border: '1px solid #0f3460'
                    }}
                  >
                    <div className="font-medium">{option.label}</div>
                    <div className="text-xs text-dark-muted mt-1">{option.description}</div>
                  </Radio.Button>
                ))}
              </div>
            </Radio.Group>
          </div>

          {/* 题材标签 */}
          <div className="mb-6">
            <label className="block text-dark-text mb-3 font-medium">题材标签</label>
            <Checkbox.Group
              value={formData.genres}
              onChange={handleGenreChange}
              className="w-full"
            >
              <div className="space-y-3">
                {Object.entries(GENRE_CATEGORIES).map(([category, genres]) => (
                  <div key={category}>
                    <span className="text-dark-muted text-xs mb-1 block">{category}</span>
                    <div className="flex flex-wrap gap-2">
                      {genres.map((genre) => (
                        <label
                          key={genre}
                          className={`genre-tag ${
                            formData.genres.includes(genre) ? 'selected' : ''
                          }`}
                        >
                          <Checkbox value={genre} className="hidden" />
                          {genre}
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </Checkbox.Group>
          </div>

          {/* 写作风格 - 作者参考 */}
          <div className="mb-6">
            <label className="block text-dark-text mb-2 font-medium">
              <UserOutlined className="mr-2" />
              写作风格参考
            </label>
            <p className="text-dark-muted text-xs mb-3">
              根据所选题材推荐知名作者，选择1-2位作为风格参考（AI会学习其写作风格）
            </p>

            {formData.genres.length === 0 ? (
              <div className="text-center py-8 text-dark-muted">
                <UserOutlined className="text-3xl mb-2 block opacity-50" />
                <p>请先选择题材标签，系统将推荐相关作者</p>
              </div>
            ) : recommendedAuthors.length === 0 ? (
              <div className="text-center py-8 text-dark-muted">
                <p>暂无该题材的推荐作者</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {recommendedAuthors.map((author) => {
                  const isSelected = formData.selectedAuthors.includes(author.name)
                  return (
                    <div
                      key={author.name}
                      onClick={() => handleAuthorSelect(author.name, author.style)}
                      className={`p-3 rounded-lg cursor-pointer transition-all border ${
                        isSelected
                          ? 'border-primary-500 bg-primary-500/20'
                          : 'border-dark-border bg-dark-bg hover:border-primary-500/50'
                      }`}
                    >
                      <div className="flex items-start justify-between mb-2">
                        <span className={`font-medium ${isSelected ? 'text-primary-400' : 'text-dark-text'}`}>
                          {author.name}
                        </span>
                        {isSelected && (
                          <Tag color="blue" className="text-xs">已选</Tag>
                        )}
                      </div>
                      <p className="text-dark-muted text-xs mb-1">{author.style}</p>
                      <p className="text-dark-muted text-xs opacity-70">代表作：{author.works}</p>
                    </div>
                  )
                })}
              </div>
            )}

            {formData.selectedAuthors.length > 0 && (
              <div className="mt-3 p-3 bg-primary-500/10 rounded-lg">
                <span className="text-primary-400 text-sm">
                  已选风格参考：{formData.selectedAuthors.join('、')}
                </span>
              </div>
            )}
          </div>
        </Card>

        {/* 提交按钮 */}
        <div className="text-center">
          <Button
            type="primary"
            size="large"
            icon={<RocketOutlined />}
            onClick={handleSubmit}
            className="gradient-button px-12 h-12 text-lg"
          >
            启动全自动创作
          </Button>
          <p className="text-dark-muted text-sm mt-4">
            AI 将自动生成：世界观设定 → 角色人设 → 分卷结构（章节大纲请在大纲页面按需生成）
          </p>
        </div>
      </div>
    </div>
  )
}

export default Home
