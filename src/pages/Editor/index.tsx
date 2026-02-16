import { useEffect, useState, useCallback, useRef } from 'react'
import { useParams } from 'react-router-dom'
import {
  Layout,
  Tree,
  Button,
  Dropdown,
  Modal,
  Input,
  message,
  Spin,
  Tooltip,
  Space,
  Empty,
  Progress
} from 'antd'
import {
  PlusOutlined,
  FolderOutlined,
  FileTextOutlined,
  MoreOutlined,
  DeleteOutlined,
  CopyOutlined,
  ThunderboltOutlined,
  SyncOutlined,
  SaveOutlined,
  PlayCircleOutlined,
  PauseCircleOutlined,
  CheckCircleOutlined,
  DownloadOutlined,
  ExportOutlined,
  ClearOutlined,
  ReadOutlined
} from '@ant-design/icons'
import type { DataNode } from 'antd/es/tree'
import RichEditor from '../../components/RichEditor'
import ReadingMode from '../../components/ReadingMode'
import { useProjectStore } from '../../stores/project'
import { useEditorStore } from '../../stores/editor'
import { isGeminiReady, initGemini, analyzeAllChaptersForArchive, analyzeChapterForDeaths } from '../../services/gemini'
import {
  quickAnalyzeDeaths,
  detectDeceasedInContent,
  formatViolationWarning,
  buildDeathConfirmationPrompt
} from '../../services/character-utils'
import {
  writeChapterStrict,
  autoWriteAll,
  formatToTxt,
  formatToHtml,
  type WriteProgress
} from '../../services/chapter-writer'
import type { Volume, Chapter } from '../../types'
import { exportVolumeAsZip, exportBookAsZip } from '../../services/export'

const { Sider, Content } = Layout

function Editor() {
  const { projectId } = useParams<{ projectId: string }>()
  const {
    currentProject,
    volumes,
    chapters,
    characters,
    currentVolume,
    currentChapter,
    loadProject,
    createVolume,
    createChapter,
    updateChapter,
    updateProject,
    updateCharacter,
    loadCharacters,
    deleteVolume,
    deleteChapter,
    setCurrentVolume,
    setCurrentChapter
  } = useProjectStore()

  const {
    content,
    setContent,
    isModified,
    isSaving,
    setSaving,
    setLastSavedAt,
    setModified,
    isAiGenerating,
    setAiGenerating,
    reset
  } = useEditorStore()

  const [isAddVolumeModalOpen, setIsAddVolumeModalOpen] = useState(false)
  const [isAddChapterModalOpen, setIsAddChapterModalOpen] = useState(false)
  const [newVolumeName, setNewVolumeName] = useState('')
  const [newChapterName, setNewChapterName] = useState('')
  const [selectedVolumeForChapter, setSelectedVolumeForChapter] = useState<string | null>(null)

  // 全自动写作状态
  const [isAutoWriting, setIsAutoWriting] = useState(false)
  const [writeProgress, setWriteProgress] = useState<WriteProgress | null>(null)
  const [autoWriteStats, setAutoWriteStats] = useState({ completed: 0, totalWords: 0 })
  const shouldStopRef = useRef(false)

  // 写本章约束条件
  const [isWriteModalOpen, setIsWriteModalOpen] = useState(false)
  const [writeConstraints, setWriteConstraints] = useState('')

  // 阅读模式
  const [isReadingMode, setIsReadingMode] = useState(false)

  // 加载项目数据
  useEffect(() => {
    if (projectId) {
      // 切换项目时重置编辑器状态
      reset()
      setContent('')
      setModified(false)
      // 加载新项目
      loadProject(projectId)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId])

  // 加载章节内容 - 将TXT格式转换为HTML显示
  useEffect(() => {
    if (currentChapter) {
      // 如果内容已经是HTML格式（包含<p>标签），直接使用
      // 否则转换TXT为HTML
      const contentToDisplay = currentChapter.content
        ? (currentChapter.content.includes('<p>')
            ? currentChapter.content
            : formatToHtml(currentChapter.content))
        : ''
      setContent(contentToDisplay)
      setModified(false)
    }
  }, [currentChapter, setContent, setModified])

  // 初始化 Gemini
  useEffect(() => {
    const initApi = async () => {
      const apiKey = await window.electron.settings.get('geminiApiKey')
      if (apiKey) {
        await initGemini(apiKey)
      }
    }
    initApi()
  }, [])

  // 计算全书章节编号
  const getGlobalChapterNumber = (chapter: Chapter): number => {
    // 获取所有按顺序排列的章节
    const sortedChapters = [...chapters].sort((a, b) => {
      // 先按卷排序
      const volA = volumes.find(v => v.id === a.volumeId)
      const volB = volumes.find(v => v.id === b.volumeId)
      if (volA && volB && volA.order !== volB.order) {
        return volA.order - volB.order
      }
      // 再按章节order排序
      return a.order - b.order
    })

    // 找到当前章节的全书索引
    const index = sortedChapters.findIndex(c => c.id === chapter.id)
    return index + 1
  }

  // 清理标题中已有的章节编号前缀（处理历史遗留数据）
  const cleanChapterTitle = (title: string): string => {
    // 移除 "第X章 " 或 "第X章" 前缀
    return title.replace(/^第\d+章\s*/, '').trim() || title
  }

  // 构建树形数据
  const buildTreeData = (): DataNode[] => {
    return volumes.map((volume) => ({
      key: `volume-${volume.id}`,
      title: (
        <div className="flex items-center justify-between group">
          <span>{volume.title}</span>
          <Dropdown
            menu={{
              items: [
                {
                  key: 'add-chapter',
                  icon: <PlusOutlined />,
                  label: '添加章节',
                  onClick: () => {
                    setSelectedVolumeForChapter(volume.id)
                    setIsAddChapterModalOpen(true)
                  }
                },
                {
                  key: 'export',
                  icon: <DownloadOutlined />,
                  label: '导出本卷',
                  onClick: () => handleExportVolume(volume)
                },
                {
                  key: 'delete',
                  icon: <DeleteOutlined />,
                  label: '删除',
                  danger: true,
                  onClick: () => handleDeleteVolume(volume)
                }
              ]
            }}
            trigger={['click']}
          >
            <Button
              type="text"
              size="small"
              icon={<MoreOutlined />}
              className="opacity-0 group-hover:opacity-100"
              onClick={(e) => e.stopPropagation()}
            />
          </Dropdown>
        </div>
      ),
      icon: <FolderOutlined className="text-primary-400" />,
      children: chapters
        .filter((ch) => ch.volumeId === volume.id)
        .sort((a, b) => a.order - b.order)
        .map((chapter) => ({
          key: `chapter-${chapter.id}`,
          title: (
            <div className="flex items-center justify-between group">
              <span className="flex items-center gap-2">
                {chapter.content && chapter.wordCount > 500 && (
                  <CheckCircleOutlined className="text-green-500 text-xs" />
                )}
                第{getGlobalChapterNumber(chapter)}章 {cleanChapterTitle(chapter.title)}
                <span className="text-dark-muted text-xs">
                  {chapter.wordCount}字
                </span>
              </span>
              <Dropdown
                menu={{
                  items: [
                    {
                      key: 'read',
                      icon: <ReadOutlined />,
                      label: '阅读模式',
                      onClick: () => {
                        setCurrentChapter(chapter)
                        setIsReadingMode(true)
                      }
                    },
                    {
                      key: 'copy',
                      icon: <CopyOutlined />,
                      label: '复制本章',
                      onClick: () => handleCopyChapter(chapter)
                    },
                    {
                      key: 'delete',
                      icon: <DeleteOutlined />,
                      label: '删除',
                      danger: true,
                      onClick: () => handleDeleteChapter(chapter)
                    }
                  ]
                }}
                trigger={['click']}
              >
                <Button
                  type="text"
                  size="small"
                  icon={<MoreOutlined />}
                  className="opacity-0 group-hover:opacity-100"
                  onClick={(e) => e.stopPropagation()}
                />
              </Dropdown>
            </div>
          ),
          icon: <FileTextOutlined className="text-dark-muted" />,
          isLeaf: true
        }))
    }))
  }

  // 选择节点
  const handleSelect = async (selectedKeys: React.Key[]) => {
    if (selectedKeys.length === 0) return

    const key = selectedKeys[0] as string
    if (key.startsWith('volume-')) {
      const volumeId = key.replace('volume-', '')
      const volume = volumes.find((v) => v.id === volumeId)
      if (volume) {
        setCurrentVolume(volume)
        // 不再调用 loadChapters，因为 loadAllChapters 已经加载了所有卷的章节
        // 避免覆盖其他卷的章节数据
      }
    } else if (key.startsWith('chapter-')) {
      const chapterId = key.replace('chapter-', '')
      const chapter = chapters.find((c) => c.id === chapterId)
      if (chapter) {
        if (isModified && currentChapter) {
          await saveCurrentChapter()
        }
        setCurrentChapter(chapter)
      }
    }
  }

  // 保存当前章节 - 将HTML转换为TXT格式保存
  // 方案一：保存后自动分析角色死亡
  const saveCurrentChapter = useCallback(async () => {
    if (!currentChapter || !isModified) return

    setSaving(true)
    try {
      // 将HTML转换为TXT格式保存到数据库
      const formattedContent = formatToTxt(content)
      await updateChapter(currentChapter.id, { content: formattedContent })
      setLastSavedAt(new Date().toISOString())
      // 保持编辑器中的HTML格式不变，只标记为已保存
      setModified(false)
      message.success('保存成功')

      // 方案一：保存后自动分析角色死亡事件
      if (formattedContent && characters.length > 0) {
        const characterNames = characters.map(c => c.name)
        // 先用本地快速分析检测
        const quickResult = quickAnalyzeDeaths(formattedContent, characterNames)

        if (quickResult.potentialDeaths.length > 0 && quickResult.confidence !== 'low') {
          // 有可能的死亡事件，提示用户确认
          const confirmMessage = buildDeathConfirmationPrompt(quickResult.potentialDeaths, currentChapter.title)

          Modal.confirm({
            title: '检测到角色死亡事件',
            content: (
              <div className="whitespace-pre-wrap text-dark-muted">
                {confirmMessage}
              </div>
            ),
            okText: '标记为已故',
            cancelText: '取消',
            onOk: async () => {
              // 调用API进行更精确的分析
              try {
                const apiResult = await analyzeChapterForDeaths(
                  currentChapter.title,
                  formattedContent,
                  characterNames
                )

                if (apiResult.deaths.length > 0) {
                  // 更新角色状态
                  for (const death of apiResult.deaths) {
                    const character = characters.find(c => c.name === death.name)
                    if (character && character.status !== 'deceased') {
                      await updateCharacter(character.id, {
                        status: 'deceased',
                        deathChapter: currentChapter.title
                      })
                    }
                  }

                  // 重新加载角色
                  if (projectId) {
                    await loadCharacters(projectId)
                  }

                  message.success(`已将 ${apiResult.deaths.length} 个角色标记为已故`)
                }
              } catch (err) {
                console.error('分析角色死亡失败:', err)
                // 即使API失败，也允许手动标记
                for (const name of quickResult.potentialDeaths) {
                  const character = characters.find(c => c.name === name)
                  if (character && character.status !== 'deceased') {
                    await updateCharacter(character.id, {
                      status: 'deceased',
                      deathChapter: currentChapter.title
                    })
                  }
                }
                if (projectId) {
                  await loadCharacters(projectId)
                }
                message.success('已标记角色为已故')
              }
            }
          })
        }
      }
    } catch (error) {
      message.error('保存失败')
    } finally {
      setSaving(false)
    }
  }, [currentChapter, content, isModified, updateChapter, setSaving, setLastSavedAt, setModified, characters, updateCharacter, loadCharacters, projectId])

  // 快捷键保存
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault()
        saveCurrentChapter()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [saveCurrentChapter])

  // 添加卷
  const handleAddVolume = async () => {
    if (!newVolumeName.trim() || !projectId) return

    await createVolume({
      projectId,
      title: newVolumeName
    })
    setNewVolumeName('')
    setIsAddVolumeModalOpen(false)
    message.success('卷添加成功')
  }

  // 添加章节
  const handleAddChapter = async () => {
    if (!newChapterName.trim() || !selectedVolumeForChapter) return

    await createChapter({
      volumeId: selectedVolumeForChapter,
      title: newChapterName
    })
    setNewChapterName('')
    setIsAddChapterModalOpen(false)
    setSelectedVolumeForChapter(null)
    message.success('章节添加成功')
  }

  // 删除卷
  const handleDeleteVolume = (volume: Volume) => {
    Modal.confirm({
      title: '确认删除',
      content: `确定要删除"${volume.title}"及其所有章节吗？`,
      okText: '删除',
      okType: 'danger',
      cancelText: '取消',
      onOk: () => deleteVolume(volume.id)
    })
  }

  // 删除章节
  const handleDeleteChapter = (chapter: Chapter) => {
    Modal.confirm({
      title: '确认删除',
      content: `确定要删除"${chapter.title}"吗？`,
      okText: '删除',
      okType: 'danger',
      cancelText: '取消',
      onOk: () => deleteChapter(chapter.id)
    })
  }

  // 复制章节
  const handleCopyChapter = async (chapter: Chapter) => {
    try {
      await navigator.clipboard.writeText(chapter.content || '')
      message.success('已复制到剪贴板')
    } catch {
      message.error('复制失败')
    }
  }

  // 导出单卷
  const handleExportVolume = async (volume: Volume) => {
    const volumeChapters = chapters.filter(c => c.volumeId === volume.id)
    if (volumeChapters.length === 0) {
      message.warning('该卷没有章节可导出')
      return
    }

    const hasContent = volumeChapters.some(c => c.content && c.content.trim().length > 0)
    if (!hasContent) {
      message.warning('该卷没有已写内容可导出')
      return
    }

    // 计算该卷起始的全书章节编号
    const sortedVolumes = [...volumes].sort((a, b) => a.order - b.order)
    let startGlobalChapterNumber = 1
    for (const vol of sortedVolumes) {
      if (vol.id === volume.id) break
      const volChapters = chapters.filter(c => c.volumeId === vol.id)
      startGlobalChapterNumber += volChapters.length
    }

    try {
      message.loading('正在导出...', 0)
      await exportVolumeAsZip(volume.title, volumeChapters, startGlobalChapterNumber)
      message.destroy()
      message.success('导出成功')
    } catch (error: any) {
      message.destroy()
      message.error(error.message || '导出失败')
    }
  }

  // 导出全书
  const handleExportBook = async () => {
    if (!currentProject) return

    if (volumes.length === 0) {
      message.warning('没有卷可导出')
      return
    }

    try {
      message.loading('正在导出全书...', 0)

      // 构建 chaptersByVolume Map
      const chaptersByVolume = new Map<string, typeof chapters>()
      for (const volume of volumes) {
        const volumeChapters = chapters.filter(c => c.volumeId === volume.id)
        chaptersByVolume.set(volume.id, volumeChapters)
      }

      await exportBookAsZip(currentProject.title, volumes, chaptersByVolume)
      message.destroy()
      message.success('全书导出成功')
    } catch (error: any) {
      message.destroy()
      message.error(error.message || '导出失败')
    }
  }

  // 清空当前章节
  const handleClearChapter = () => {
    Modal.confirm({
      title: '确认清空',
      content: '确定要清空当前章节的内容吗？此操作不可恢复。',
      okText: '确认清空',
      cancelText: '取消',
      okButtonProps: { danger: true },
      onOk: () => {
        setContent('')
        setModified(true)
        message.success('已清空章节内容')
      }
    })
  }

  // 打开写作约束输入框
  const handleOpenWriteModal = () => {
    if (!isGeminiReady()) {
      message.warning('请先在全局设置中配置 Gemini API Key')
      return
    }

    if (!currentChapter?.outline) {
      message.warning('请先为本章设置大纲')
      return
    }

    setWriteConstraints('')
    setIsWriteModalOpen(true)
  }

  // AI 写作当前章节
  const handleAiWriteChapter = async (constraints?: string) => {
    if (!isGeminiReady()) {
      message.warning('请先在全局设置中配置 Gemini API Key')
      return
    }

    if (!currentChapter?.outline) {
      message.warning('请先为本章设置大纲')
      return
    }

    if (!currentProject) return

    // 关闭约束输入框
    setIsWriteModalOpen(false)

    setAiGenerating(true)
    message.loading('AI 正在严格按照大纲写作...', 0)

    try {
      // 获取前一章内容
      const volumeChapters = chapters
        .filter(c => c.volumeId === currentChapter.volumeId)
        .sort((a, b) => a.order - b.order)
      const currentIndex = volumeChapters.findIndex(c => c.id === currentChapter.id)
      const previousChapter = currentIndex > 0 ? volumeChapters[currentIndex - 1] : null
      const nextChapter = currentIndex < volumeChapters.length - 1 ? volumeChapters[currentIndex + 1] : null

      // 如果有约束条件，追加到大纲后面
      const outlineWithConstraints = constraints
        ? `${currentChapter.outline}\n\n【写作约束】\n${constraints}`
        : currentChapter.outline

      const generatedContent = await writeChapterStrict(
        currentProject.worldSetting,
        characters,
        currentChapter.title,
        outlineWithConstraints,
        previousChapter?.content || '',
        nextChapter?.outline || '',
        currentProject.styles,
        2500
      )

      message.destroy()

      // 方案二：生成后校验 - 检测是否有已故角色出场
      const validationResult = detectDeceasedInContent(generatedContent, characters)
      if (validationResult.hasViolation) {
        const warningMessage = formatViolationWarning(validationResult.violations)
        Modal.warning({
          title: '⚠️ 检测到已故角色出场',
          content: (
            <div className="whitespace-pre-wrap text-dark-muted max-h-64 overflow-y-auto">
              {warningMessage}
            </div>
          ),
          okText: '我知道了',
          width: 500
        })
      }

      // 转换为HTML格式在编辑器中显示
      setContent(formatToHtml(generatedContent))
      setModified(true)
      message.success(validationResult.hasViolation
        ? 'AI 写作完成，但检测到已故角色出场，请检查修改'
        : 'AI 写作完成，请检查后保存'
      )
    } catch (error: any) {
      message.destroy()
      message.error(error.message || 'AI 写作失败')
    } finally {
      setAiGenerating(false)
    }
  }


  // 全自动写作 - 自动从第一个未写章节开始
  const handleStartAutoWrite = async () => {
    if (!isGeminiReady()) {
      message.warning('请先在全局设置中配置 Gemini API Key')
      return
    }

    if (!currentProject) return

    // 检查是否有章节
    if (chapters.length === 0) {
      message.warning('没有可写的章节，请先创建章节大纲')
      return
    }

    // 🔍 调试：打印卷信息
    console.log('📚 [AutoWrite] 卷列表:', volumes.map(v => ({ id: v.id.slice(0, 8), title: v.title, order: v.order })))

    // 按顺序排序章节（从第一章开始）- 使用卷的order字段而不是volumeId字符串比较
    const sortedChapters = [...chapters].sort((a, b) => {
      const volA = volumes.find(v => v.id === a.volumeId)
      const volB = volumes.find(v => v.id === b.volumeId)
      // 先按卷的order排序
      if (volA && volB && volA.order !== volB.order) {
        return volA.order - volB.order
      }
      // 再按章节order排序
      return a.order - b.order
    })

    // 🔍 调试：打印排序后的章节
    console.log('📖 [AutoWrite] 排序后章节:', sortedChapters.map((c, i) => {
      const vol = volumes.find(v => v.id === c.volumeId)
      return {
        globalIndex: i + 1,
        volTitle: vol?.title,
        volOrder: vol?.order,
        chapterTitle: c.title,
        chapterOrder: c.order,
        hasContent: c.content && c.content.trim().length > 500
      }
    }))

    // 计算待写章节数和找到第一个未写的章节
    const unwrittenChapters = sortedChapters.filter(
      c => !c.content || c.content.trim().length <= 500
    )

    if (unwrittenChapters.length === 0) {
      message.info('所有章节都已完成，无需继续写作')
      return
    }

    // 自动从第一个未写的章节开始
    const startChapter = unwrittenChapters[0]

    // 🔍 调试：打印起始章节信息
    const startVol = volumes.find(v => v.id === startChapter.volumeId)
    console.log('🎯 [AutoWrite] 起始章节:', {
      volTitle: startVol?.title,
      volOrder: startVol?.order,
      chapterTitle: startChapter.title,
      chapterOrder: startChapter.order
    })
    const startChapterIndex = sortedChapters.findIndex(c => c.id === startChapter.id)
    const startChapterNumber = startChapterIndex + 1

    Modal.confirm({
      title: '全自动写作',
      content: (
        <div>
          <p>AI 将自动从「第 {startChapterNumber} 章」开始，写完所有未完成章节。</p>
          <p className="text-primary-400 mt-2">待写章节：{unwrittenChapters.length} 章</p>
          <p className="text-dark-muted text-sm mt-2">
            - 已有内容的章节（超过500字）会自动跳过<br />
            - 缺少大纲的章节会跳过并报错<br />
            - 可以随时点击停止按钮中断写作
          </p>
        </div>
      ),
      okText: '开始写作',
      cancelText: '取消',
      onOk: () => doAutoWrite(startChapter.id)
    })
  }

  const doAutoWrite = async (startFromChapterId: string) => {
    if (!currentProject) return

    setIsAutoWriting(true)
    setAutoWriteStats({ completed: 0, totalWords: 0 })
    shouldStopRef.current = false

    try {
      // 读取自动更新配置
      const autoUpdateEnabled = await window.electron.settings.get('autoUpdateEnabled')
      const summaryInterval = await window.electron.settings.get('summaryInterval')
      const characterInterval = await window.electron.settings.get('characterInterval')

      const autoUpdateConfig = {
        enableAutoUpdate: autoUpdateEnabled !== false, // 默认true
        summaryInterval: summaryInterval || 20,
        characterInterval: characterInterval || 30
      }

      console.log('📊 [Editor] 自动更新配置:', autoUpdateConfig)

      // 获取所有章节并添加卷顺序信息（用于正确排序）
      const allChaptersWithVolume = chapters.map(c => {
        const vol = volumes.find(v => v.id === c.volumeId)
        return {
          ...c,
          volumeId: c.volumeId,
          volumeOrder: vol?.order ?? 0  // 添加卷的顺序用于排序
        }
      })

      const result = await autoWriteAll(
        currentProject.worldSetting,
        characters,
        allChaptersWithVolume,
        currentProject.styles,
        2500,
        (progress) => {
          setWriteProgress(progress)
          if (progress.status === 'complete' || progress.status === 'saving') {
            setAutoWriteStats(prev => ({
              completed: prev.completed + (progress.status === 'saving' ? 1 : 0),
              totalWords: prev.totalWords
            }))
          }
        },
        async (chapterId, chapterContent) => {
          await updateChapter(chapterId, { content: chapterContent })
          setAutoWriteStats(prev => ({
            ...prev,
            totalWords: prev.totalWords + chapterContent.length
          }))
          // 如果是当前正在查看的章节，更新内容（转换为HTML显示）
          if (currentChapter?.id === chapterId) {
            setContent(formatToHtml(chapterContent))
            setModified(false)
          }
        },
        () => shouldStopRef.current,
        startFromChapterId,
        async (summary) => {
          // 保存全书摘要到项目
          if (projectId) {
            await updateProject(projectId, { summary })
            console.log('✅ [Editor] 全书摘要已自动保存')
          }
        },
        async (recentChapters) => {
          // 自动更新角色档案（生死状态、出场记录、关系网络）
          if (projectId) {
            try {
              const characterNames = characters.map(c => c.name)
              const result = await analyzeAllChaptersForArchive(
                recentChapters,
                characterNames,
                () => {} // 空进度回调
              )

              // 更新每个角色的档案
              for (const update of result.characterUpdates) {
                const character = characters.find(c => c.name === update.name)
                if (character) {
                  await updateCharacter(character.id, {
                    status: update.isDead ? 'deceased' : (update.appearances.length > 0 ? 'active' : 'pending'),
                    deathChapter: update.deathChapter,
                    appearances: update.appearances,
                    relationships: update.relationships
                  })
                }
              }

              // 重新加载角色数据
              await loadCharacters(projectId)
              console.log(`✅ [Editor] 已自动更新 ${result.characterUpdates.length} 个角色档案`)
            } catch (error) {
              console.warn('Failed to auto-update character archive:', error)
            }
          }
        },
        autoUpdateConfig
      )

      message.success(`全自动写作完成！成功 ${result.completed} 章，共 ${(result.totalWords / 10000).toFixed(1)} 万字`)
    } catch (error: any) {
      message.error(error.message || '全自动写作失败')
    } finally {
      setIsAutoWriting(false)
      setWriteProgress(null)
      // 重新加载数据
      if (projectId) {
        await loadProject(projectId)
      }
    }
  }

  // 停止自动写作
  const handleStopAutoWrite = () => {
    shouldStopRef.current = true
    message.info('正在停止，请等待当前章节完成...')
  }

  if (!currentProject) {
    return (
      <div className="h-full flex items-center justify-center">
        <Spin size="large" tip="加载中..." />
      </div>
    )
  }

  return (
    <>
    <Layout className="h-full">
      {/* 左侧章节树 */}
      <Sider
        width={280}
        style={{
          background: '#16213e',
          borderRight: '1px solid #0f3460',
          overflow: 'auto'
        }}
      >
        <div className="p-4">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-dark-text font-medium">章节目录</h3>
            <Button
              size="small"
              icon={<PlusOutlined />}
              onClick={() => setIsAddVolumeModalOpen(true)}
            >
              添加卷
            </Button>
          </div>

          {volumes.length === 0 ? (
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description="暂无章节"
              className="mt-8"
            >
              <Button
                type="primary"
                size="small"
                onClick={() => setIsAddVolumeModalOpen(true)}
              >
                创建第一卷
              </Button>
            </Empty>
          ) : (
            <Tree
              className="chapter-tree"
              treeData={buildTreeData()}
              selectedKeys={
                currentChapter
                  ? [`chapter-${currentChapter.id}`]
                  : currentVolume
                  ? [`volume-${currentVolume.id}`]
                  : []
              }
              onSelect={handleSelect}
              defaultExpandAll
              showIcon
              blockNode
            />
          )}
        </div>
      </Sider>

      {/* 中间编辑区 */}
      <Content className="flex flex-col">
        {/* 全自动写作进度条 */}
        {isAutoWriting && writeProgress && (
          <div className="px-4 py-3 bg-primary-500/10 border-b border-primary-500/30">
            <div className="flex items-center justify-between mb-2">
              <span className="text-dark-text">
                全自动写作中：第{writeProgress.currentChapter}章 {writeProgress.chapterTitle} ({writeProgress.currentChapter}/{writeProgress.totalChapters})
                <span className="text-dark-muted ml-2">
                  已完成 {autoWriteStats.completed} 章，{(autoWriteStats.totalWords / 10000).toFixed(1)} 万字
                </span>
              </span>
              <Button
                size="small"
                danger
                icon={<PauseCircleOutlined />}
                onClick={handleStopAutoWrite}
              >
                停止
              </Button>
            </div>
            <Progress
              percent={Math.floor((writeProgress.currentChapter / writeProgress.totalChapters) * 100)}
              status="active"
              strokeColor={{ '0%': '#0ea5e9', '100%': '#0284c7' }}
            />
            <span className="text-dark-muted text-xs">
              {writeProgress.status === 'writing' && '正在生成内容...'}
              {writeProgress.status === 'saving' && '正在保存...'}
              {writeProgress.status === 'error' && `跳过: ${writeProgress.error}`}
            </span>
          </div>
        )}

        {/* 工具栏 */}
        <div
          className="flex items-center justify-between px-4 py-2 border-b border-dark-border"
          style={{ background: '#16213e' }}
        >
          <div className="flex items-center gap-2">
            <span className="text-dark-text font-medium">
              {currentChapter ? `第${getGlobalChapterNumber(currentChapter)}章 ${cleanChapterTitle(currentChapter.title)}` : '未选择章节'}
            </span>
            {isModified && (
              <span className="text-yellow-500 text-sm">（未保存）</span>
            )}
            {currentChapter?.outline && (
              <Tooltip title={currentChapter.outline}>
                <span className="text-dark-muted text-xs cursor-help">
                  [有大纲]
                </span>
              </Tooltip>
            )}
          </div>

          <Space>
            <Tooltip title="保存 (Ctrl+S)">
              <Button
                icon={isSaving ? <SyncOutlined spin /> : <SaveOutlined />}
                onClick={saveCurrentChapter}
                disabled={!isModified || isSaving}
              >
                保存
              </Button>
            </Tooltip>

            <Tooltip title="清空当前章节内容">
              <Button
                icon={<ClearOutlined />}
                onClick={handleClearChapter}
                disabled={!currentChapter || isAutoWriting}
                danger
              >
                清空
              </Button>
            </Tooltip>

            <Tooltip title="AI 按大纲写作（可添加约束条件）">
              <Button
                type="primary"
                icon={isAiGenerating ? <SyncOutlined spin /> : <ThunderboltOutlined />}
                onClick={handleOpenWriteModal}
                loading={isAiGenerating}
                disabled={!currentChapter || isAutoWriting}
              >
                写本章
              </Button>
            </Tooltip>

            <Tooltip title="全自动写作（从第一章开始，写完自动写下一章）">
              <Button
                type="primary"
                danger={isAutoWriting}
                icon={isAutoWriting ? <SyncOutlined spin /> : <PlayCircleOutlined />}
                onClick={isAutoWriting ? handleStopAutoWrite : handleStartAutoWrite}
                disabled={chapters.length === 0}
              >
                {isAutoWriting ? '停止' : '全自动'}
              </Button>
            </Tooltip>

            <Tooltip title="导出全书为ZIP（每章一个TXT文件）">
              <Button
                icon={<ExportOutlined />}
                onClick={handleExportBook}
                disabled={volumes.length === 0}
              >
                导出全书
              </Button>
            </Tooltip>

            <Tooltip title="进入阅读模式（以读者视角查看）">
              <Button
                icon={<ReadOutlined />}
                onClick={() => setIsReadingMode(true)}
                disabled={!currentChapter}
              >
                阅读
              </Button>
            </Tooltip>
          </Space>
        </div>

        {/* 编辑器 */}
        {currentChapter ? (
          <div className="flex-1 overflow-hidden">
            <RichEditor
              content={content}
              onChange={setContent}
              placeholder="开始写作你的故事..."
            />
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description="请从左侧选择或创建章节开始写作"
            />
          </div>
        )}
      </Content>

      {/* 添加卷对话框 */}
      <Modal
        title="添加新卷"
        open={isAddVolumeModalOpen}
        onOk={handleAddVolume}
        onCancel={() => setIsAddVolumeModalOpen(false)}
        okText="添加"
        cancelText="取消"
      >
        <Input
          placeholder="请输入卷名，如：序章"
          value={newVolumeName}
          onChange={(e) => setNewVolumeName(e.target.value)}
          onPressEnter={handleAddVolume}
        />
      </Modal>

      {/* 添加章节对话框 */}
      <Modal
        title="添加新章节"
        open={isAddChapterModalOpen}
        onOk={handleAddChapter}
        onCancel={() => {
          setIsAddChapterModalOpen(false)
          setSelectedVolumeForChapter(null)
        }}
        okText="添加"
        cancelText="取消"
      >
        <Input
          placeholder="请输入章节名，如：开端"
          value={newChapterName}
          onChange={(e) => setNewChapterName(e.target.value)}
          onPressEnter={handleAddChapter}
        />
      </Modal>

      {/* 写作约束输入对话框 */}
      <Modal
        title="写本章 - 添加约束条件"
        open={isWriteModalOpen}
        onOk={() => handleAiWriteChapter(writeConstraints)}
        onCancel={() => setIsWriteModalOpen(false)}
        okText="开始写作"
        cancelText="取消"
        width={600}
      >
        <div className="space-y-4">
          <div>
            <div className="text-dark-text mb-2">
              当前章节：<span className="text-primary-400">
                {currentChapter ? `第${getGlobalChapterNumber(currentChapter)}章 ${cleanChapterTitle(currentChapter.title)}` : ''}
              </span>
            </div>
            <div className="text-dark-muted text-sm mb-4">
              AI 将严格按照大纲进行写作。如果有额外的约束条件（如特定情节、对话要求、氛围等），请在下方输入。
            </div>
          </div>
          <Input.TextArea
            placeholder="例如：&#10;- 本章要有一段主角与反派的对话&#10;- 氛围要营造紧张感&#10;- 结尾留下悬念&#10;&#10;如无特殊要求，可直接点击开始写作"
            value={writeConstraints}
            onChange={(e) => setWriteConstraints(e.target.value)}
            rows={8}
            style={{ resize: 'none' }}
          />
        </div>
      </Modal>

    </Layout>

    {/* 阅读模式 - 放在 Layout 外面确保正确覆盖 */}
    <ReadingMode
      visible={isReadingMode}
      onClose={() => {
        console.log('[Editor] ReadingMode onClose called, setting isReadingMode to false')
        setIsReadingMode(false)
      }}
      currentChapter={currentChapter}
      chapters={chapters}
      volumes={volumes}
      onChapterChange={(chapter) => setCurrentChapter(chapter)}
    />
    </>
  )
}

export default Editor
