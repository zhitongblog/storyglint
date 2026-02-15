import { useState, useEffect, useCallback } from 'react'
import { Modal, Button, Slider, Tooltip, Space, Drawer, List, Typography } from 'antd'
import {
  CloseOutlined,
  LeftOutlined,
  RightOutlined,
  MenuOutlined,
  FontSizeOutlined,
  FullscreenOutlined,
  FullscreenExitOutlined,
  HomeOutlined
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

// 将HTML内容转换为纯文本并保持段落格式
function htmlToReadableText(html: string): string {
  if (!html) return ''

  // 替换段落标签为换行
  let text = html
    .replace(/<p[^>]*>/gi, '')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '') // 移除其他HTML标签
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .trim()

  // 清理多余的空行
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
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [showChapterList, setShowChapterList] = useState(false)
  const [readingProgress, setReadingProgress] = useState(0)

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

  // 键盘快捷键
  useEffect(() => {
    if (!visible) return

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
        e.preventDefault()
        handlePrevChapter()
      } else if (e.key === 'ArrowRight' || e.key === 'PageDown') {
        e.preventDefault()
        handleNextChapter()
      } else if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [visible, handlePrevChapter, handleNextChapter, onClose])

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

  if (!currentChapter) return null

  const content = htmlToReadableText(currentChapter.content || '')

  return (
    <Modal
      open={visible}
      onCancel={onClose}
      footer={null}
      width="100%"
      style={{ top: 0, padding: 0, maxWidth: '100vw' }}
      styles={{
        body: { padding: 0, height: '100vh', overflow: 'hidden' },
        content: { borderRadius: 0, height: '100vh' }
      }}
      closeIcon={null}
      className="reading-mode-modal"
    >
      <div className="h-full flex flex-col" style={{ background: '#1a1a2e' }}>
        {/* 顶部工具栏 */}
        <div
          className="flex items-center justify-between px-4 py-2 border-b"
          style={{ background: '#16213e', borderColor: '#0f3460' }}
        >
          <div className="flex items-center gap-4">
            <Tooltip title="退出阅读模式 (Esc)">
              <Button
                type="text"
                icon={<CloseOutlined />}
                onClick={onClose}
                className="text-gray-400 hover:text-white"
              />
            </Tooltip>
            <Tooltip title="章节目录">
              <Button
                type="text"
                icon={<MenuOutlined />}
                onClick={() => setShowChapterList(true)}
                className="text-gray-400 hover:text-white"
              />
            </Tooltip>
          </div>

          <div className="flex items-center gap-2">
            <Text className="text-gray-300">
              {currentVolume?.title} · 第{getGlobalChapterNumber(currentChapter)}章 {currentChapter.title}
            </Text>
          </div>

          <div className="flex items-center gap-2">
            <Tooltip title="字体大小">
              <Space>
                <FontSizeOutlined className="text-gray-400" />
                <Slider
                  min={14}
                  max={28}
                  value={fontSize}
                  onChange={setFontSize}
                  style={{ width: 100 }}
                />
                <span className="text-gray-400 text-sm w-8">{fontSize}</span>
              </Space>
            </Tooltip>
            <Tooltip title={isFullscreen ? '退出全屏' : '全屏'}>
              <Button
                type="text"
                icon={isFullscreen ? <FullscreenExitOutlined /> : <FullscreenOutlined />}
                onClick={toggleFullscreen}
                className="text-gray-400 hover:text-white"
              />
            </Tooltip>
          </div>
        </div>

        {/* 阅读进度条 */}
        <div className="h-1 bg-gray-800">
          <div
            className="h-full bg-gradient-to-r from-purple-500 to-violet-600 transition-all duration-200"
            style={{ width: `${readingProgress}%` }}
          />
        </div>

        {/* 内容区域 */}
        <div
          id="reading-content-area"
          className="flex-1 overflow-auto"
          style={{ background: '#0f0f1a' }}
        >
          <div
            className="max-w-3xl mx-auto px-8 py-12"
            style={{ fontSize: `${fontSize}px`, lineHeight: 1.8 }}
          >
            {/* 章节标题 */}
            <h1
              className="text-center mb-8 font-bold"
              style={{ fontSize: `${fontSize + 8}px`, color: '#e0e0e0' }}
            >
              第{getGlobalChapterNumber(currentChapter)}章 {currentChapter.title}
            </h1>

            {/* 章节内容 */}
            {content ? (
              <div className="text-gray-300 whitespace-pre-wrap leading-relaxed">
                {content.split('\n\n').map((paragraph, index) => (
                  <p key={index} className="mb-6 indent-8">
                    {paragraph}
                  </p>
                ))}
              </div>
            ) : (
              <div className="text-center text-gray-500 py-20">
                本章暂无内容
              </div>
            )}

            {/* 章节信息 */}
            <div className="mt-16 pt-8 border-t border-gray-800 text-center text-gray-500 text-sm">
              本章共 {currentChapter.wordCount || 0} 字
            </div>
          </div>
        </div>

        {/* 底部导航 */}
        <div
          className="flex items-center justify-between px-8 py-4 border-t"
          style={{ background: '#16213e', borderColor: '#0f3460' }}
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

          <div className="text-gray-400 text-sm">
            {currentIndex + 1} / {sortedChapters.length}
            <span className="mx-2">·</span>
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
      </div>

      {/* 章节目录抽屉 */}
      <Drawer
        title="章节目录"
        placement="left"
        onClose={() => setShowChapterList(false)}
        open={showChapterList}
        width={350}
        styles={{
          body: { padding: 0, background: '#16213e' },
          header: { background: '#16213e', borderBottom: '1px solid #0f3460', color: '#fff' }
        }}
      >
        <div className="h-full overflow-auto" style={{ background: '#16213e' }}>
          {chapterListData.map(({ volume, chapters: volChapters }) => (
            <div key={volume.id} className="mb-4">
              <div
                className="px-4 py-2 font-medium text-purple-400 sticky top-0"
                style={{ background: '#16213e' }}
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
                      className={`cursor-pointer px-4 py-2 border-none ${
                        isActive ? 'bg-purple-500/20' : 'hover:bg-white/5'
                      }`}
                      onClick={() => {
                        onChapterChange(chapter)
                        setShowChapterList(false)
                      }}
                    >
                      <div className="flex items-center justify-between w-full">
                        <span className={isActive ? 'text-purple-400' : 'text-gray-300'}>
                          第{globalNum}章 {chapter.title}
                        </span>
                        <span className="text-gray-500 text-xs">
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
    </Modal>
  )
}

export default ReadingMode
