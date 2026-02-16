import { useState, useEffect, useCallback } from 'react'
import { Button, Slider, Tooltip, Drawer, List, Typography, Segmented, Select } from 'antd'
import {
  CloseOutlined,
  LeftOutlined,
  RightOutlined,
  MenuOutlined,
  FontSizeOutlined,
  FullscreenOutlined,
  FullscreenExitOutlined,
  BgColorsOutlined,
  ReadOutlined,
  FontColorsOutlined
} from '@ant-design/icons'
import type { Chapter, Volume } from '../../types'

const { Text } = Typography

interface ReadingModeProps {
  visible: boolean
  onClose: () => void
  currentChapter: Chapter | null
  chapters: Chapter[]
  volumes: Volume[]
  onChapterChange: (chapter: Chapter) => void
}

// 背景色主题配置
const THEME_OPTIONS = [
  { key: 'dark', label: '夜间', bg: '#0f0f1a', text: '#d0d0d0', title: '#e0e0e0' },
  { key: 'sepia', label: '羊皮纸', bg: '#f4ecd8', text: '#5b4636', title: '#3d2914' },
  { key: 'green', label: '护眼绿', bg: '#cce8cf', text: '#2d4a32', title: '#1a3d1f' },
  { key: 'light', label: '日间', bg: '#ffffff', text: '#333333', title: '#000000' },
  { key: 'gray', label: '灰色', bg: '#e8e8e8', text: '#444444', title: '#222222' },
  { key: 'blue', label: '淡蓝', bg: '#e3f2fd', text: '#1565c0', title: '#0d47a1' },
  { key: 'pink', label: '浅粉', bg: '#fce4ec', text: '#c2185b', title: '#880e4f' }
]

// 字体选项
const FONT_OPTIONS = [
  { value: 'system', label: '系统默认', font: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' },
  { value: 'songti', label: '宋体', font: '"SimSun", "宋体", serif' },
  { value: 'kaiti', label: '楷体', font: '"KaiTi", "楷体", serif' },
  { value: 'heiti', label: '黑体', font: '"SimHei", "黑体", sans-serif' },
  { value: 'fangsong', label: '仿宋', font: '"FangSong", "仿宋", serif' }
]

// 将HTML内容转换为纯文本并保持段落格式
function htmlToReadableText(html: string): string {
  if (!html) return ''

  let text = html
    .replace(/<p[^>]*>/gi, '')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .trim()

  text = text.replace(/\n{3,}/g, '\n\n')

  return text
}

function ReadingMode({
  visible,
  onClose,
  currentChapter,
  chapters,
  volumes,
  onChapterChange
}: ReadingModeProps) {
  const [fontSize, setFontSize] = useState(18)
  const [fontFamily, setFontFamily] = useState('system')
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [showChapterList, setShowChapterList] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [readingProgress, setReadingProgress] = useState(0)
  const [theme, setTheme] = useState<string>('dark')
  const [dualPage, setDualPage] = useState(false)
  const [windowWidth, setWindowWidth] = useState(window.innerWidth)

  // 获取当前主题配置
  const currentTheme = THEME_OPTIONS.find(t => t.key === theme) || THEME_OPTIONS[0]

  // 获取当前字体
  const currentFont = FONT_OPTIONS.find(f => f.value === fontFamily)?.font || FONT_OPTIONS[0].font

  // 监听窗口大小变化
  useEffect(() => {
    const handleResize = () => {
      setWindowWidth(window.innerWidth)
    }
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  // 获取排序后的所有章节
  const getSortedChapters = useCallback(() => {
    const sortedVolumes = [...volumes].sort((a, b) => a.order - b.order)
    const result: Chapter[] = []

    for (const volume of sortedVolumes) {
      const volumeChapters = chapters
        .filter(c => c.volumeId === volume.id)
        .sort((a, b) => a.order - b.order)
      result.push(...volumeChapters)
    }

    return result
  }, [chapters, volumes])

  // 获取当前章节在全书中的索引
  const getCurrentIndex = useCallback(() => {
    if (!currentChapter) return -1
    const sortedChapters = getSortedChapters()
    return sortedChapters.findIndex(c => c.id === currentChapter.id)
  }, [currentChapter, getSortedChapters])

  // 获取全书章节编号
  const getGlobalChapterNumber = useCallback((chapter: Chapter): number => {
    const sortedChapters = getSortedChapters()
    return sortedChapters.findIndex(c => c.id === chapter.id) + 1
  }, [getSortedChapters])

  // 获取章节所属的卷
  const getVolumeForChapter = useCallback((chapter: Chapter): Volume | undefined => {
    return volumes.find(v => v.id === chapter.volumeId)
  }, [volumes])

  // 上一章
  const handlePrevChapter = useCallback(() => {
    const sortedChapters = getSortedChapters()
    const currentIndex = getCurrentIndex()
    if (currentIndex > 0) {
      onChapterChange(sortedChapters[currentIndex - 1])
    }
  }, [getSortedChapters, getCurrentIndex, onChapterChange])

  // 下一章
  const handleNextChapter = useCallback(() => {
    const sortedChapters = getSortedChapters()
    const currentIndex = getCurrentIndex()
    if (currentIndex < sortedChapters.length - 1) {
      onChapterChange(sortedChapters[currentIndex + 1])
    }
  }, [getSortedChapters, getCurrentIndex, onChapterChange])

  // 退出阅读模式 - 直接调用 onClose
  const handleClose = useCallback(() => {
    // 如果是全屏模式，先退出全屏
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {})
    }
    // 直接调用 onClose
    onClose()
  }, [onClose])

  // 键盘快捷键
  useEffect(() => {
    if (!visible) return

    const handleKeyDown = (e: KeyboardEvent) => {
      // 忽略在输入框中的按键
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return
      }

      if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
        e.preventDefault()
        handlePrevChapter()
      } else if (e.key === 'ArrowRight' || e.key === 'PageDown') {
        e.preventDefault()
        handleNextChapter()
      } else if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        handleClose()
      }
    }

    // 使用 capture 确保最先接收到事件
    document.addEventListener('keydown', handleKeyDown, true)
    return () => document.removeEventListener('keydown', handleKeyDown, true)
  }, [visible, handlePrevChapter, handleNextChapter, handleClose])

  // 监听滚动计算阅读进度
  useEffect(() => {
    const handleScroll = (e: Event) => {
      const target = e.target as HTMLElement
      if (target.scrollHeight > target.clientHeight) {
        const progress = (target.scrollTop / (target.scrollHeight - target.clientHeight)) * 100
        setReadingProgress(Math.min(100, Math.max(0, progress)))
      }
    }

    const contentArea = document.getElementById('reading-content-area')
    if (contentArea) {
      contentArea.addEventListener('scroll', handleScroll)
      return () => contentArea.removeEventListener('scroll', handleScroll)
    }
  }, [visible, currentChapter])

  // 切换全屏
  const toggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen()
      setIsFullscreen(true)
    } else {
      document.exitFullscreen()
      setIsFullscreen(false)
    }
  }, [])

  // 监听全屏变化
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement)
    }
    document.addEventListener('fullscreenchange', handleFullscreenChange)
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange)
  }, [])

  const sortedChapters = getSortedChapters()
  const currentIndex = getCurrentIndex()
  const hasPrev = currentIndex > 0
  const hasNext = currentIndex < sortedChapters.length - 1
  const currentVolume = currentChapter ? getVolumeForChapter(currentChapter) : null

  // 构建章节列表数据（按卷分组）
  const chapterListData = volumes
    .sort((a, b) => a.order - b.order)
    .map(volume => ({
      volume,
      chapters: chapters
        .filter(c => c.volumeId === volume.id)
        .sort((a, b) => a.order - b.order)
    }))

  // 如果不可见或没有章节，不渲染
  if (!visible || !currentChapter) return null

  const content = htmlToReadableText(currentChapter.content || '')
  const paragraphs = content.split('\n\n').filter(p => p.trim())

  // 双栏模式下分割段落
  const canUseDualPage = windowWidth >= 1200
  const midPoint = Math.ceil(paragraphs.length / 2)
  const leftParagraphs = dualPage && canUseDualPage ? paragraphs.slice(0, midPoint) : paragraphs
  const rightParagraphs = dualPage && canUseDualPage ? paragraphs.slice(midPoint) : []

  // 工具栏背景色（根据主题调整）
  const toolbarBg = theme === 'dark' ? '#16213e' : theme === 'light' ? '#f0f0f0' : theme === 'sepia' ? '#e8dcc8' : theme === 'green' ? '#b8d9bb' : theme === 'blue' ? '#bbdefb' : theme === 'pink' ? '#f8bbd9' : '#d8d8d8'
  const toolbarBorder = theme === 'dark' ? '#0f3460' : '#cccccc'
  const toolbarText = theme === 'dark' ? '#9ca3af' : '#666666'

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 9999,
        display: 'flex',
        flexDirection: 'column',
        background: currentTheme.bg
      }}
    >
      {/* 顶部工具栏 */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '8px 16px',
          background: toolbarBg,
          borderBottom: `1px solid ${toolbarBorder}`
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <Tooltip title="退出阅读模式 (Esc)">
            <Button
              type="text"
              icon={<CloseOutlined />}
              onClick={handleClose}
              style={{ color: toolbarText }}
            />
          </Tooltip>
          <Tooltip title="章节目录">
            <Button
              type="text"
              icon={<MenuOutlined />}
              onClick={() => setShowChapterList(true)}
              style={{ color: toolbarText }}
            />
          </Tooltip>
          <Tooltip title="阅读设置">
            <Button
              type="text"
              icon={<BgColorsOutlined />}
              onClick={() => setShowSettings(true)}
              style={{ color: toolbarText }}
            />
          </Tooltip>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Text style={{ color: toolbarText }}>
            {currentVolume?.title} · 第{getGlobalChapterNumber(currentChapter)}章 {currentChapter.title}
          </Text>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {canUseDualPage && (
            <Tooltip title={dualPage ? '单栏模式' : '双栏模式'}>
              <Button
                type={dualPage ? 'primary' : 'text'}
                icon={<ReadOutlined />}
                onClick={() => setDualPage(!dualPage)}
                style={{ color: dualPage ? undefined : toolbarText }}
              />
            </Tooltip>
          )}
          <Tooltip title={isFullscreen ? '退出全屏' : '全屏'}>
            <Button
              type="text"
              icon={isFullscreen ? <FullscreenExitOutlined /> : <FullscreenOutlined />}
              onClick={toggleFullscreen}
              style={{ color: toolbarText }}
            />
          </Tooltip>
        </div>
      </div>

      {/* 阅读进度条 */}
      <div style={{ height: '4px', background: theme === 'dark' ? '#1f2937' : '#e0e0e0' }}>
        <div
          style={{
            height: '100%',
            width: `${readingProgress}%`,
            background: 'linear-gradient(to right, #a855f7, #7c3aed)',
            transition: 'width 0.2s'
          }}
        />
      </div>

      {/* 内容区域 */}
      <div
        id="reading-content-area"
        style={{
          flex: 1,
          overflow: 'auto',
          background: currentTheme.bg
        }}
      >
        <div
          style={{
            maxWidth: dualPage && canUseDualPage ? '1200px' : '700px',
            margin: '0 auto',
            padding: '48px 32px',
            fontSize: `${fontSize}px`,
            lineHeight: 1.8,
            fontFamily: currentFont
          }}
        >
          {/* 章节标题 */}
          <h1
            style={{
              textAlign: 'center',
              marginBottom: '32px',
              fontWeight: 'bold',
              fontSize: `${fontSize + 8}px`,
              color: currentTheme.title,
              fontFamily: currentFont
            }}
          >
            第{getGlobalChapterNumber(currentChapter)}章 {currentChapter.title}
          </h1>

          {/* 章节内容 */}
          {content ? (
            dualPage && canUseDualPage ? (
              // 双栏模式
              <div style={{ display: 'flex', gap: '48px' }}>
                <div style={{ flex: 1, color: currentTheme.text }}>
                  {leftParagraphs.map((paragraph, index) => (
                    <p key={index} style={{ marginBottom: '24px', textIndent: '2em' }}>
                      {paragraph}
                    </p>
                  ))}
                </div>
                <div
                  style={{
                    width: '1px',
                    background: theme === 'dark' ? '#333' : '#ddd'
                  }}
                />
                <div style={{ flex: 1, color: currentTheme.text }}>
                  {rightParagraphs.map((paragraph, index) => (
                    <p key={index} style={{ marginBottom: '24px', textIndent: '2em' }}>
                      {paragraph}
                    </p>
                  ))}
                </div>
              </div>
            ) : (
              // 单栏模式
              <div style={{ color: currentTheme.text }}>
                {paragraphs.map((paragraph, index) => (
                  <p key={index} style={{ marginBottom: '24px', textIndent: '2em' }}>
                    {paragraph}
                  </p>
                ))}
              </div>
            )
          ) : (
            <div style={{ textAlign: 'center', padding: '80px 0', color: toolbarText }}>
              本章暂无内容
            </div>
          )}

          {/* 章节信息 */}
          <div
            style={{
              marginTop: '64px',
              paddingTop: '32px',
              borderTop: `1px solid ${theme === 'dark' ? '#333' : '#ddd'}`,
              textAlign: 'center',
              fontSize: '14px',
              color: toolbarText
            }}
          >
            本章共 {currentChapter.wordCount || 0} 字
          </div>
        </div>
      </div>

      {/* 底部导航 */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '16px 32px',
          background: toolbarBg,
          borderTop: `1px solid ${toolbarBorder}`
        }}
      >
        <Button
          type="primary"
          icon={<LeftOutlined />}
          onClick={handlePrevChapter}
          disabled={!hasPrev}
          size="large"
        >
          上一章
        </Button>

        <div style={{ color: toolbarText, fontSize: '14px' }}>
          {currentIndex + 1} / {sortedChapters.length}
          <span style={{ margin: '0 8px' }}>·</span>
          使用 ← → 键或 PageUp/PageDown 翻页
        </div>

        <Button
          type="primary"
          icon={<RightOutlined />}
          onClick={handleNextChapter}
          disabled={!hasNext}
          size="large"
          iconPosition="end"
        >
          下一章
        </Button>
      </div>

      {/* 章节目录抽屉 */}
      <Drawer
        title="章节目录"
        placement="left"
        onClose={() => setShowChapterList(false)}
        open={showChapterList}
        width={350}
        zIndex={10001}
        styles={{
          body: { padding: 0, background: '#16213e' },
          header: { background: '#16213e', borderBottom: '1px solid #0f3460', color: '#fff' }
        }}
      >
        <div style={{ height: '100%', overflow: 'auto', background: '#16213e' }}>
          {chapterListData.map(({ volume, chapters: volChapters }) => (
            <div key={volume.id} style={{ marginBottom: '16px' }}>
              <div
                style={{
                  padding: '8px 16px',
                  fontWeight: 500,
                  color: '#a78bfa',
                  position: 'sticky',
                  top: 0,
                  background: '#16213e'
                }}
              >
                {volume.title}
              </div>
              <List
                dataSource={volChapters}
                renderItem={(chapter) => {
                  const isActive = chapter.id === currentChapter?.id
                  const globalNum = getGlobalChapterNumber(chapter)
                  const hasContent = chapter.content && chapter.wordCount > 0

                  return (
                    <List.Item
                      style={{
                        cursor: 'pointer',
                        padding: '8px 16px',
                        border: 'none',
                        background: isActive ? 'rgba(168, 85, 247, 0.2)' : 'transparent'
                      }}
                      onClick={() => {
                        onChapterChange(chapter)
                        setShowChapterList(false)
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                        <span style={{ color: isActive ? '#a78bfa' : '#d1d5db' }}>
                          第{globalNum}章 {chapter.title}
                        </span>
                        <span style={{ color: '#6b7280', fontSize: '12px' }}>
                          {hasContent ? `${chapter.wordCount}字` : '未写'}
                        </span>
                      </div>
                    </List.Item>
                  )
                }}
              />
            </div>
          ))}
        </div>
      </Drawer>

      {/* 阅读设置抽屉 */}
      <Drawer
        title="阅读设置"
        placement="right"
        onClose={() => setShowSettings(false)}
        open={showSettings}
        width={320}
        zIndex={10001}
        styles={{
          body: { background: '#16213e' },
          header: { background: '#16213e', borderBottom: '1px solid #0f3460', color: '#fff' }
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          {/* 字体大小 */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px', color: '#d1d5db' }}>
              <FontSizeOutlined />
              <span>字体大小</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
              <span style={{ color: '#6b7280', fontSize: '14px' }}>小</span>
              <Slider
                min={14}
                max={32}
                value={fontSize}
                onChange={setFontSize}
                style={{ flex: 1 }}
              />
              <span style={{ color: '#6b7280', fontSize: '14px' }}>大</span>
            </div>
            <div style={{ textAlign: 'center', color: '#9ca3af', marginTop: '8px' }}>{fontSize}px</div>
          </div>

          {/* 字体选择 */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px', color: '#d1d5db' }}>
              <FontColorsOutlined />
              <span>字体</span>
            </div>
            <Select
              value={fontFamily}
              onChange={setFontFamily}
              style={{ width: '100%' }}
              options={FONT_OPTIONS.map(f => ({ value: f.value, label: f.label }))}
            />
          </div>

          {/* 背景颜色 */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px', color: '#d1d5db' }}>
              <BgColorsOutlined />
              <span>背景颜色</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px' }}>
              {THEME_OPTIONS.map(t => (
                <Tooltip key={t.key} title={t.label}>
                  <div
                    style={{
                      width: '48px',
                      height: '48px',
                      borderRadius: '8px',
                      cursor: 'pointer',
                      border: theme === t.key ? '2px solid #a855f7' : '2px solid transparent',
                      transform: theme === t.key ? 'scale(1.1)' : 'scale(1)',
                      transition: 'all 0.2s',
                      background: t.bg
                    }}
                    onClick={() => setTheme(t.key)}
                  />
                </Tooltip>
              ))}
            </div>
          </div>

          {/* 阅读模式 */}
          {canUseDualPage && (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px', color: '#d1d5db' }}>
                <ReadOutlined />
                <span>阅读模式</span>
              </div>
              <Segmented
                block
                value={dualPage ? 'dual' : 'single'}
                onChange={(val) => setDualPage(val === 'dual')}
                options={[
                  { label: '单栏', value: 'single' },
                  { label: '双栏', value: 'dual' }
                ]}
              />
              <div style={{ color: '#6b7280', fontSize: '12px', marginTop: '8px' }}>
                屏幕宽度 ≥ 1200px 时可使用双栏模式
              </div>
            </div>
          )}

          {/* 快捷键说明 */}
          <div style={{ paddingTop: '16px', borderTop: '1px solid #374151' }}>
            <div style={{ color: '#9ca3af', fontSize: '14px', marginBottom: '8px' }}>快捷键</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', color: '#6b7280', fontSize: '12px' }}>
              <div>← / PageUp：上一章</div>
              <div>→ / PageDown：下一章</div>
              <div>Esc：退出阅读模式</div>
            </div>
          </div>
        </div>
      </Drawer>
    </div>
  )
}

export default ReadingMode
