import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { Card, Input, Button, Spin, message, Select, Checkbox, Space, Divider } from 'antd'
import { PictureOutlined, DownloadOutlined, RobotOutlined, ReloadOutlined, UserOutlined } from '@ant-design/icons'
import { useProjectStore } from '../../stores/project'
import { isGeminiReady, initGemini, generateCoverImage, getCurrentModelName } from '../../services/gemini'
import { getConfiguredApiKey } from '../../utils'

// 扩展的风格选项
const styleOptions = [
  // 东方风格
  { value: 'wuxia', label: '武侠仙侠' },
  { value: 'xuanhuan', label: '东方玄幻' },
  { value: 'xianxia', label: '修仙飘渺' },
  { value: 'ancient', label: '古风宫廷' },
  { value: 'ink', label: '水墨国风' },
  // 西方风格
  { value: 'fantasy', label: '西方奇幻' },
  { value: 'medieval', label: '中世纪' },
  { value: 'gothic', label: '哥特暗黑' },
  { value: 'steampunk', label: '蒸汽朋克' },
  // 现代风格
  { value: 'modern', label: '都市现代' },
  { value: 'scifi', label: '科幻未来' },
  { value: 'cyberpunk', label: '赛博朋克' },
  { value: 'mecha', label: '机甲战争' },
  // 情感风格
  { value: 'romance', label: '浪漫唯美' },
  { value: 'youth', label: '青春校园' },
  { value: 'warm', label: '温馨治愈' },
  // 其他风格
  { value: 'horror', label: '恐怖惊悚' },
  { value: 'mystery', label: '悬疑推理' },
  { value: 'apocalypse', label: '末日废土' },
  { value: 'anime', label: '日系动漫' },
  { value: 'realistic', label: '写实油画' },
  { value: 'comic', label: '漫画插画' }
]

/**
 * 在图像上叠加书名和作者名
 */
async function addTextToCover(
  imageUrl: string,
  title: string,
  author: string
): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      const canvas = document.createElement('canvas')
      const ctx = canvas.getContext('2d')
      if (!ctx) {
        reject(new Error('Canvas not supported'))
        return
      }

      // 设置画布尺寸
      canvas.width = img.width
      canvas.height = img.height

      // 绘制背景图
      ctx.drawImage(img, 0, 0)

      // 添加半透明渐变遮罩（顶部和底部）
      const gradientTop = ctx.createLinearGradient(0, 0, 0, canvas.height * 0.4)
      gradientTop.addColorStop(0, 'rgba(0, 0, 0, 0.6)')
      gradientTop.addColorStop(1, 'rgba(0, 0, 0, 0)')
      ctx.fillStyle = gradientTop
      ctx.fillRect(0, 0, canvas.width, canvas.height * 0.4)

      const gradientBottom = ctx.createLinearGradient(0, canvas.height * 0.7, 0, canvas.height)
      gradientBottom.addColorStop(0, 'rgba(0, 0, 0, 0)')
      gradientBottom.addColorStop(1, 'rgba(0, 0, 0, 0.6)')
      ctx.fillStyle = gradientBottom
      ctx.fillRect(0, canvas.height * 0.7, canvas.width, canvas.height * 0.3)

      // 计算字体大小（根据画布宽度）
      const titleFontSize = Math.floor(canvas.width / 8)
      const authorFontSize = Math.floor(canvas.width / 16)

      // 绘制书名（顶部居中）
      ctx.textAlign = 'center'
      ctx.textBaseline = 'top'

      // 书名阴影
      ctx.shadowColor = 'rgba(0, 0, 0, 0.8)'
      ctx.shadowBlur = 10
      ctx.shadowOffsetX = 2
      ctx.shadowOffsetY = 2

      // 书名样式
      ctx.font = `bold ${titleFontSize}px "PingFang SC", "Microsoft YaHei", sans-serif`
      ctx.fillStyle = '#ffffff'

      // 如果书名太长，分行显示
      const maxWidth = canvas.width * 0.8
      const titleLines = wrapText(ctx, title, maxWidth)
      const titleY = canvas.height * 0.12

      titleLines.forEach((line, index) => {
        ctx.fillText(line, canvas.width / 2, titleY + index * (titleFontSize * 1.3))
      })

      // 绘制作者名（底部居中）
      if (author) {
        ctx.font = `${authorFontSize}px "PingFang SC", "Microsoft YaHei", sans-serif`
        ctx.fillStyle = '#e0e0e0'
        ctx.textBaseline = 'bottom'
        ctx.fillText(`作者：${author}`, canvas.width / 2, canvas.height * 0.92)
      }

      // 重置阴影
      ctx.shadowColor = 'transparent'
      ctx.shadowBlur = 0

      resolve(canvas.toDataURL('image/png'))
    }
    img.onerror = () => reject(new Error('Failed to load image'))
    img.src = imageUrl
  })
}

/**
 * 文字换行处理
 */
function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const lines: string[] = []
  let currentLine = ''

  for (const char of text) {
    const testLine = currentLine + char
    const metrics = ctx.measureText(testLine)

    if (metrics.width > maxWidth && currentLine) {
      lines.push(currentLine)
      currentLine = char
    } else {
      currentLine = testLine
    }
  }

  if (currentLine) {
    lines.push(currentLine)
  }

  return lines.slice(0, 3) // 最多3行
}

function Cover() {
  const { projectId } = useParams<{ projectId: string }>()
  const { currentProject, loadProject, updateProject, characters, loadCharacters } = useProjectStore()

  const [bookTitle, setBookTitle] = useState('')
  const [authorName, setAuthorName] = useState('')
  const [style, setStyle] = useState('xuanhuan')
  const [isGenerating, setIsGenerating] = useState(false)
  const [coverUrl, setCoverUrl] = useState<string | null>(null)
  const [coverHistory, setCoverHistory] = useState<string[]>([])
  // 角色选择
  const [selectedCharacterIds, setSelectedCharacterIds] = useState<string[]>([])

  useEffect(() => {
    if (projectId) {
      loadProject(projectId)
      loadCharacters(projectId)
    }
  }, [projectId, loadProject, loadCharacters])

  // 加载项目时，同时加载作者名和封面历史
  useEffect(() => {
    if (currentProject) {
      setBookTitle(currentProject.title)
      // 加载保存的作者名
      if (currentProject.author) {
        setAuthorName(currentProject.author)
      }
      // 加载保存的封面历史
      if (currentProject.coverHistory && currentProject.coverHistory.length > 0) {
        setCoverHistory(currentProject.coverHistory)
        // 默认显示最近一张
        setCoverUrl(currentProject.coverHistory[0])
      }
    }
  }, [currentProject])

  // 作者名变化时自动保存（防抖）
  useEffect(() => {
    if (!projectId || !currentProject) return
    // 只有当作者名真正改变时才保存
    if (authorName !== (currentProject.author || '')) {
      const timer = setTimeout(() => {
        updateProject(projectId, { author: authorName })
      }, 500)
      return () => clearTimeout(timer)
    }
  }, [authorName, projectId, currentProject, updateProject])

  // 初始化 Gemini
  useEffect(() => {
    const initApi = async () => {
      const apiKey = await getConfiguredApiKey()
      if (apiKey) {
        await initGemini(apiKey)
      }
    }
    initApi()
  }, [])

  // 生成封面 - 使用 Gemini 3 图像生成 + 文字叠加
  const handleGenerateCover = async () => {
    if (!bookTitle.trim()) {
      message.warning('请输入书名')
      return
    }

    if (!isGeminiReady()) {
      message.warning('请先在全局设置中配置 Gemini API Key')
      return
    }

    setIsGenerating(true)
    message.loading('AI 正在生成封面背景...', 0)

    try {
      // 获取选中的角色信息
      const selectedCharacters = characters.filter(c => selectedCharacterIds.includes(c.id))

      // 第一步：生成背景图（包含角色）
      const backgroundUrl = await generateCoverImage(
        bookTitle,
        authorName,
        style,
        currentProject?.genres || [],
        selectedCharacters
      )

      message.destroy()
      message.loading('正在添加书名和作者...', 0)

      // 第二步：叠加文字
      const finalCoverUrl = await addTextToCover(
        backgroundUrl,
        bookTitle,
        authorName
      )

      message.destroy()
      setCoverUrl(finalCoverUrl)
      // 添加到历史记录并保存到项目
      const newHistory = [finalCoverUrl, ...coverHistory.slice(0, 4)]
      setCoverHistory(newHistory)
      // 保存封面历史到项目
      if (projectId) {
        updateProject(projectId, { coverHistory: newHistory })
      }
      message.success('封面生成完成！')
    } catch (error: any) {
      message.destroy()
      console.error('Cover generation error:', error)
      message.error(error.message || '生成失败，请重试')
    } finally {
      setIsGenerating(false)
    }
  }

  // 下载封面
  const handleDownloadCover = () => {
    if (!coverUrl) return

    // 创建下载链接
    const link = document.createElement('a')
    link.href = coverUrl
    link.download = `${bookTitle}_封面.png`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  // 选择历史封面
  const handleSelectHistoryCover = (url: string) => {
    setCoverUrl(url)
  }

  if (!currentProject) {
    return (
      <div className="h-full flex items-center justify-center">
        <Spin size="large" tip="加载中..." />
      </div>
    )
  }

  return (
    <div className="p-6 fade-in">
      {/* 头部 */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-dark-text mb-1">封面生成</h1>
        <p className="text-dark-muted">使用 AI 为你的作品生成精美封面</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 左侧设置 */}
        <Card
          title="封面设置"
          style={{ background: '#16213e', border: '1px solid #0f3460' }}
        >
          <div className="space-y-4">
            <div>
              <label className="block text-dark-text mb-2">书名 *</label>
              <Input
                size="large"
                placeholder="输入书名"
                value={bookTitle}
                onChange={(e) => setBookTitle(e.target.value)}
              />
            </div>

            <div>
              <label className="block text-dark-text mb-2">作者署名</label>
              <Input
                size="large"
                placeholder="输入作者名（可选）"
                value={authorName}
                onChange={(e) => setAuthorName(e.target.value)}
              />
            </div>

            <div>
              <label className="block text-dark-text mb-2">封面风格</label>
              <Select
                size="large"
                className="w-full"
                value={style}
                onChange={setStyle}
                options={styleOptions}
                showSearch
                optionFilterProp="label"
              />
            </div>

            {/* 角色选择 */}
            <div>
              <label className="block text-dark-text mb-2">
                <Space>
                  <UserOutlined />
                  <span>封面人物</span>
                  <span className="text-dark-muted text-sm">（选择要展示的角色）</span>
                </Space>
              </label>
              {characters.length === 0 ? (
                <div className="text-dark-muted text-sm p-3 bg-dark-bg rounded">
                  暂无角色，请先在角色管理中创建角色
                </div>
              ) : (
                <div className="max-h-40 overflow-y-auto p-3 bg-dark-bg rounded space-y-2">
                  <Checkbox.Group
                    value={selectedCharacterIds}
                    onChange={(values) => setSelectedCharacterIds(values as string[])}
                    className="w-full"
                  >
                    <Space direction="vertical" className="w-full">
                      {characters.slice(0, 10).map((char) => (
                        <Checkbox key={char.id} value={char.id} className="w-full">
                          <span className="text-dark-text">{char.name}</span>
                          {char.role && (
                            <span className="text-dark-muted text-xs ml-2">
                              ({char.role === 'protagonist' ? '主角' : char.role === 'antagonist' ? '反派' : '配角'})
                            </span>
                          )}
                        </Checkbox>
                      ))}
                    </Space>
                  </Checkbox.Group>
                  {selectedCharacterIds.length > 0 && (
                    <div className="text-primary-400 text-xs mt-2">
                      已选择 {selectedCharacterIds.length} 个角色
                    </div>
                  )}
                </div>
              )}
            </div>

            <Divider className="my-2" />

            <div className="space-y-3">
              <Button
                type="primary"
                size="large"
                icon={<RobotOutlined />}
                onClick={handleGenerateCover}
                loading={isGenerating}
                className="w-full gradient-button"
              >
                {isGenerating ? '生成中...' : 'AI 生成封面'}
              </Button>
              {coverUrl && (
                <Button
                  size="large"
                  icon={<ReloadOutlined />}
                  onClick={handleGenerateCover}
                  loading={isGenerating}
                  className="w-full"
                >
                  重新生成
                </Button>
              )}
            </div>

            <div className="text-dark-muted text-sm">
              <p>提示：</p>
              <ul className="list-disc list-inside mt-2 space-y-1">
                <li>使用 Gemini 3 模型生成封面</li>
                <li>AI 将根据书名和风格自动生成封面</li>
                <li>生成过程可能需要数秒</li>
                <li>可多次生成直到满意为止</li>
              </ul>
            </div>
          </div>
        </Card>

        {/* 右侧预览 */}
        <Card
          title="封面预览"
          extra={
            coverUrl && (
              <Button
                icon={<DownloadOutlined />}
                onClick={handleDownloadCover}
              >
                下载封面
              </Button>
            )
          }
          style={{ background: '#16213e', border: '1px solid #0f3460' }}
        >
          <div
            className="flex items-center justify-center"
            style={{ minHeight: 400 }}
          >
            {isGenerating ? (
              <div className="text-center">
                <Spin size="large" />
                <p className="text-dark-muted mt-4">AI 正在创作你的封面...</p>
                <p className="text-dark-muted text-sm mt-2">
                  使用模型: {getCurrentModelName()}
                </p>
              </div>
            ) : coverUrl ? (
              <div className="text-center">
                <div
                  className="inline-block rounded-lg overflow-hidden shadow-2xl"
                  style={{ maxWidth: '100%' }}
                >
                  <img
                    src={coverUrl}
                    alt={`${bookTitle} 封面`}
                    style={{
                      maxWidth: 320,
                      maxHeight: 480,
                      objectFit: 'contain',
                      borderRadius: 8
                    }}
                  />
                </div>
                <p className="text-dark-muted text-sm mt-4">
                  点击下载按钮保存封面图片
                </p>
              </div>
            ) : (
              <div className="text-center">
                <PictureOutlined className="text-6xl text-dark-muted mb-4" />
                <p className="text-dark-muted">点击左侧按钮生成封面</p>
              </div>
            )}
          </div>
        </Card>
      </div>

      {/* 封面历史 */}
      <Card
        className="mt-6"
        title="生成历史"
        extra={
          coverHistory.length > 0 && (
            <Button
              size="small"
              onClick={() => {
                setCoverHistory([])
                setCoverUrl(null)
                if (projectId) {
                  updateProject(projectId, { coverHistory: [] })
                }
              }}
            >
              清空历史
            </Button>
          )
        }
        style={{ background: '#16213e', border: '1px solid #0f3460' }}
      >
        {coverHistory.length === 0 ? (
          <div className="text-center text-dark-muted py-8">
            <PictureOutlined className="text-4xl mb-2" />
            <p>暂无历史记录</p>
            <p className="text-sm">生成的封面将显示在这里</p>
          </div>
        ) : (
          <div className="flex gap-4 flex-wrap">
            {coverHistory.map((url, index) => (
              <div
                key={index}
                className="cursor-pointer hover:opacity-80 transition-opacity"
                onClick={() => handleSelectHistoryCover(url)}
              >
                <img
                  src={url}
                  alt={`历史封面 ${index + 1}`}
                  style={{
                    width: 100,
                    height: 150,
                    objectFit: 'cover',
                    borderRadius: 4,
                    border: coverUrl === url ? '2px solid #0ea5e9' : '2px solid transparent'
                  }}
                />
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  )
}

export default Cover
