import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import {
  Card,
  Button,
  Input,
  InputNumber,
  Collapse,
  Modal,
  Spin,
  Empty,
  Tag,
  Space,
  Tooltip,
  Progress,
  Popconfirm,
  Radio,
  App
} from 'antd'
import {
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  CheckCircleOutlined,
  SyncOutlined,
  ThunderboltOutlined,
  DownloadOutlined,
  ClearOutlined,
  ReloadOutlined
} from '@ant-design/icons'
import JSZip from 'jszip'
import { saveAs } from 'file-saver'
import { useProjectStore } from '../../stores/project'
import { generateVolumeChapters, generateChaptersOneByOne } from '../../services/auto-create'
import { isAIReady, initAI, setProvider, getCurrentProviderType } from '../../services/ai'
import { extractAllVolumeKeyPoints } from '../../services/outline-optimizer'
import { getConfiguredApiKey, getAIProviderConfig } from '../../utils'
import type { Chapter } from '../../types'

const { TextArea } = Input
const { Panel } = Collapse

function Outline() {
  const { projectId } = useParams<{ projectId: string }>()
  const { modal, message } = App.useApp()
  const {
    currentProject,
    volumes,
    chapters,
    characters,
    loadProject,
    createVolume,
    updateVolume,
    deleteVolume,
    createChapter,
    updateChapter,
    deleteChapter,
    loadAllChapters,
    setGenerating
  } = useProjectStore()

  const [generatingVolumeId, setGeneratingVolumeId] = useState<string | null>(null)
  const [generatingProgress, setGeneratingProgress] = useState(0)
  const [isAddVolumeModalOpen, setIsAddVolumeModalOpen] = useState(false)
  const [newVolumeData, setNewVolumeData] = useState({ title: '', summary: '' })
  const [editingChapter, setEditingChapter] = useState<{
    id: string
    title: string
    outline: string
  } | null>(null)
  const [generateChapterCount, setGenerateChapterCount] = useState(40)
  const [showGenerateModal, setShowGenerateModal] = useState<string | null>(null)
  const [generateGuidance, setGenerateGuidance] = useState('')
  const [generateMode, setGenerateMode] = useState<'batch' | 'oneByOne'>('batch')
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [useCompression, setUseCompression] = useState(true)  // 默认启用压缩
  const [isExtractingKeyPoints, setIsExtractingKeyPoints] = useState(false)
  const [extractProgress, setExtractProgress] = useState(0)

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

  // 手动刷新数据
  const handleRefreshData = async () => {
    if (!projectId || !currentProject) return

    setIsRefreshing(true)
    console.log('🔄 [大纲页面] 手动刷新数据...')

    try {
      // 直接从数据库查询验证数据
      console.log('🔍 [大纲页面] 直接查询数据库...')
      const dbVolumes = await window.electron.db.getVolumes(projectId)
      console.log(`📦 [大纲页面] 数据库中实际有 ${dbVolumes.length} 卷:`, dbVolumes.map(v => v.title))

      // 统计每卷的章节数
      for (const vol of dbVolumes) {
        const volChapters = await window.electron.db.getChapters(vol.id)
        console.log(`  └─ ${vol.title}: ${volChapters.length} 章`)
      }

      // 重新加载项目数据
      await loadProject(projectId)
      message.success(`数据刷新成功！找到 ${dbVolumes.length} 卷`)
    } catch (error: any) {
      console.error('❌ [大纲页面] 刷新失败:', error)
      message.error('刷新失败，请重试')
    } finally {
      setIsRefreshing(false)
    }
  }

  // 为所有卷提取核心要点
  const handleExtractAllKeyPoints = async () => {
    if (!projectId || volumes.length === 0) {
      message.warning('没有可提取的卷')
      return
    }

    if (!isAIReady()) {
      message.warning('请先在全局设置中配置 AI API Key')
      return
    }

    modal.confirm({
      title: '为所有卷提取核心要点？',
      content: (
        <div>
          <p>将为 {volumes.length} 卷自动提取3-5个核心要点，用于：</p>
          <ul>
            <li>✅ 提升全书逻辑一致性</li>
            <li>✅ 节约60%以上的token消耗</li>
            <li>✅ 避免大纲重复和冲突</li>
          </ul>
          <p className="text-dark-muted">预计消耗约 {volumes.length * 500} tokens</p>
        </div>
      ),
      onOk: async () => {
        setIsExtractingKeyPoints(true)
        setExtractProgress(0)

        try {
          console.log('[大纲优化] 开始提取核心要点...')

          const updatedVolumes = await extractAllVolumeKeyPoints(
            volumes,
            (current, total) => {
              setExtractProgress(Math.floor((current / total) * 100))
            }
          )

          console.log('[大纲优化] 提取完成，更新数据库...')

          // 更新数据库
          for (const vol of updatedVolumes) {
            await updateVolume(vol.id, { keyPoints: vol.keyPoints })
          }

          // 重新加载数据
          await loadProject(projectId)

          message.success(`成功为 ${volumes.length} 卷提取核心要点！`)
        } catch (error: any) {
          console.error('[大纲优化] 提取失败:', error)
          message.error(`提取失败: ${error.message}`)
        } finally {
          setIsExtractingKeyPoints(false)
          setExtractProgress(0)
        }
      }
    })
  }

  useEffect(() => {
    if (projectId) {
      console.log('📖 [大纲页面] 开始加载项目:', projectId)
      loadProject(projectId)
    }
  }, [projectId, loadProject])

  // 监听 volumes 和 chapters 的变化，输出诊断信息
  useEffect(() => {
    console.log(`📊 [大纲页面] 数据更新:`)
    console.log(`  📦 卷数量: ${volumes.length}`)
    console.log(`  📄 章节数量: ${chapters.length}`)
    if (volumes.length > 0) {
      console.log('  📋 卷列表:', volumes.map((v, i) => `${i + 1}. ${v.title}`))
      // 统计每卷的章节数
      volumes.forEach((vol, idx) => {
        const volChapters = chapters.filter(c => c.volumeId === vol.id)
        console.log(`    └─ 第${idx + 1}卷 ${vol.title}: ${volChapters.length} 章`)
      })
    }
  }, [volumes, chapters])

  useEffect(() => {
    const initApi = async () => {
      const config = await getAIProviderConfig()
      if (config?.apiKey) {
        // 切换到用户配置的提供商
        if (config.provider && config.provider !== getCurrentProviderType()) {
          setProvider(config.provider as any)
        }
        await initAI(config.apiKey, config.model)
      }
    }
    initApi()
  }, [])

  // 为单卷生成章节大纲（只支持追加生成，不允许自动删除）
  const handleGenerateVolumeChapters = async (volumeId: string) => {
    if (!currentProject) return

    const volume = volumes.find(v => v.id === volumeId)
    if (!volume) return

    if (!isAIReady()) {
      message.warning('请先在全局设置中配置 AI API Key')
      return
    }

    // 防止重复生成
    if (generatingVolumeId === volumeId) {
      message.warning('该卷正在生成中，请稍候...')
      return
    }

    const existingChapters = chapters.filter(c => c.volumeId === volumeId)

    if (existingChapters.length > 0) {
      // 已有章节，显示确认追加生成
      modal.confirm({
        title: '确认追加生成',
        content: (
          <div>
            <p>该卷已有 <strong>{existingChapters.length}</strong> 章，追加生成将在现有章节后新增 <strong>{generateChapterCount}</strong> 章。</p>
            <p className="text-dark-muted text-sm mt-2">
              💡 如需清空现有章节，请使用卷标题右侧的"清空本卷所有章节"按钮。
            </p>
          </div>
        ),
        okText: '追加生成',
        cancelText: '取消',
        onOk: () => {
          setShowGenerateModal(null)
          doGenerateChapters(volumeId, volume, false)
        },
        onCancel: () => {
          setShowGenerateModal(null)
        }
      })
    } else {
      // 无现有章节，直接生成
      setShowGenerateModal(null)
      doGenerateChapters(volumeId, volume, false)
    }
  }

  const doGenerateChapters = async (volumeId: string, volume: typeof volumes[0], _shouldDelete: boolean = false) => {
    // 注意：_shouldDelete 参数已废弃，保留仅为兼容性，始终使用追加模式
    // 用户如需删除章节，应使用"清空本卷所有章节"按钮手动删除
    if (!currentProject) return

    console.log('🚀 [大纲生成] 开始生成章节...')
    console.log(`📦 卷信息: ${volume.title}`)
    console.log(`🔄 模式: 追加生成（自动删除已禁用）`)

    try {
      // 🔒 数据库级别的锁检查（防止并发生成）
      console.log('🔒 [大纲生成] 尝试获取数据库锁...')
      const lockResult = await window.electron.db.trySetGeneratingLock(volumeId)

      if (!lockResult.success) {
        // 锁已被占用，说明正在生成中
        const minutesAgo = lockResult.lockedMinutesAgo || 0
        console.error(`❌ [大纲生成] 该卷正在生成中（${minutesAgo} 分钟前开始）`)

        message.error({
          content: (
            <div>
              <div>⚠️ 该卷正在生成中，请稍候</div>
              <div style={{ marginTop: 4, fontSize: 12, opacity: 0.8 }}>
                生成操作已在 {minutesAgo} 分钟前启动，请等待其完成后再试。
                如果长时间未完成，锁会在 5 分钟后自动释放。
              </div>
            </div>
          ),
          duration: 6
        })
        return
      }

      console.log('✅ [大纲生成] 成功获取数据库锁')

      // 设置前端锁（用于UI状态）
      setGeneratingVolumeId(volumeId)
      setGeneratingProgress(10)
      // 设置全局生成状态（用于导航守卫）
      setGenerating(true)

      // 重新加载章节列表，获取数据库最新状态
      console.log('🔄 [大纲生成] 重新加载章节列表以获取最新状态...')
      await loadAllChapters(currentProject.id)
      await new Promise(resolve => setTimeout(resolve, 100))

      // 重新获取最新的章节列表
      const latestChapters = await window.electron.db.getChapters(volumeId)
      const existingChapters = latestChapters.sort((a: any, b: any) => a.order - b.order)
      console.log(`📊 [大纲生成] 数据库中现有章节数: ${existingChapters.length}`)

      // 注意：已移除自动删除逻辑，用户需通过"清空本卷所有章节"按钮手动删除

      setGeneratingProgress(15)

      // 获取当前卷的索引
      const currentVolumeIndex = volumes.findIndex(v => v.id === volumeId)

      // 获取相邻卷的信息
      const previousVolume = currentVolumeIndex > 0 ? volumes[currentVolumeIndex - 1] : null
      const nextVolume = currentVolumeIndex < volumes.length - 1 ? volumes[currentVolumeIndex + 1] : null

      // 获取上一卷的章节（用于了解剧情进度）- 从数据库获取确保数据准确
      let previousVolumeChapters: string[] = []
      let previousVolumeSummary: string = ''
      if (previousVolume) {
        // 直接从数据库查询上一卷的章节，避免依赖可能过时的 store 数据
        const prevChaptersFromDb = await window.electron.db.getChapters(previousVolume.id)
        const prevChapters = prevChaptersFromDb.sort((a: any, b: any) => a.order - b.order)
        previousVolumeChapters = prevChapters.map((c: any) =>
          `${c.title}: ${c.outline || '(无大纲)'}`
        )
        // 传递上一卷的完整摘要，让AI知道哪些内容已经完成
        previousVolumeSummary = previousVolume.summary
      }

      // 获取下一卷的信息（避免提前写）- 这是防止越界的关键
      const nextVolumeSummary = nextVolume ? nextVolume.summary : ''
      // 同时检查 keyEvents 和 keyPoints（两者可能都存在）
      const nextVolumeKeyEvents = nextVolume
        ? ((nextVolume as any).keyEvents || (nextVolume as any).keyPoints || [])
        : []
      const nextVolumeDetails = nextVolume
        ? {
            title: nextVolume.title,
            summary: nextVolume.summary,
            mainPlot: (nextVolume as any).mainPlot || '',
            keyEvents: nextVolumeKeyEvents
          }
        : null

      console.log('🔒 [大纲生成] 下一卷边界信息:', nextVolumeDetails
        ? `《${nextVolumeDetails.title}》关键事件: ${nextVolumeKeyEvents.length}个`
        : '无下一卷'
      )

      // 收集本卷已写内容的摘要（追加生成时使用）
      const writtenChaptersSummary = existingChapters.length > 0
        ? existingChapters
            .filter(c => c.content && c.content.trim().length > 100)
            .map(c => {
              const textContent = c.content.replace(/<[^>]*>/g, '').trim()
              const summary = textContent.length > 200 ? textContent.slice(0, 200) + '...' : textContent
              return `${c.title}: ${summary}`
            })
        : []

      let generatedChapters: { chapterNumber: number; title: string; outline: string }[]

      // 构建完整角色档案（包含关系、生死状态）
      const characterArchives = characters.map(c => ({
        name: c.name,
        role: c.role,
        identity: c.identity,
        status: c.status,
        deathChapter: c.deathChapter || '',
        appearances: c.appearances || [],
        relationships: c.relationships || []
      }))

      if (generateMode === 'oneByOne') {
        // 逐章生成模式（节约token）
        console.log('📝 [大纲生成] 使用逐章生成模式')
        const existingOutlines = existingChapters.map(c => ({
          title: c.title,
          outline: c.outline
        }))

        // 计算全局章节编号：从数据库获取前面所有卷的章节数（避免依赖可能过时的 store 数据）
        const volumeIndex = volumes.findIndex(v => v.id === volumeId)
        let chaptersBeforeCurrentVolume = 0
        for (let i = 0; i < volumeIndex; i++) {
          // 直接从数据库查询每个卷的章节数，确保数据准确
          const volChapters = await window.electron.db.getChapters(volumes[i].id)
          chaptersBeforeCurrentVolume += volChapters.length
        }

        // 追加模式：前面卷 + 当前卷已有 + 1
        const startChapterNumber = chaptersBeforeCurrentVolume + existingChapters.length + 1

        console.log(`📊 [大纲生成] 章节编号: 从第 ${startChapterNumber} 章开始，共生成 ${generateChapterCount} 章`)

        // 准备扩展上下文信息（避免重复，包含边界约束所需参数）
        const extendedContext = {
          writtenSummary: writtenChaptersSummary.length > 0
            ? writtenChaptersSummary.slice(-2).join('；')  // 只传递最后2章的摘要
            : undefined,
          previousVolumeInfo: previousVolumeChapters.length > 0
            ? previousVolumeChapters.slice(-2).join('；')  // 只传递上一卷最后2章
            : undefined,
          previousVolumeSummary: previousVolumeSummary || undefined,
          nextVolumeInfo: nextVolumeDetails
            ? `${nextVolumeDetails.title}: ${nextVolumeDetails.summary}`
            : undefined,
          nextVolumeTitle: nextVolume?.title,  // 下一卷标题（重要边界标识）
          characterInfo: characterArchives
            .filter(c => c.status === 'active')
            .slice(0, 5)
            .map(c => `${c.name}(${c.identity})`)
            .join('、'),
          volumeTitle: volume.title  // 当前卷标题
        }

        console.log('🤖 [大纲生成] 开始调用 API（逐章模式）...')
        generatedChapters = await generateChaptersOneByOne(
          volume.summary,
          existingOutlines,
          generateChapterCount,
          currentProject.genres,
          generateGuidance,
          (current, total) => {
            setGeneratingProgress(15 + Math.floor((current / total) * 70))
          },
          startChapterNumber,  // 传入全局章节编号
          extendedContext      // 传入扩展上下文
        )
        console.log(`✅ [大纲生成] API 调用成功，生成了 ${generatedChapters.length} 章`)
      } else {
        // 批量生成模式（读取完整角色档案）
        console.log('📦 [大纲生成] 使用批量生成模式')
        const volumeIndex = volumes.findIndex(v => v.id === volumeId)
        const totalVolumes = volumes.length
        const characterInfo = characters.map(c => ({
          name: c.name,
          role: c.role,
          identity: c.identity
        }))
        console.log(`👥 [大纲生成] 角色数量: ${characterInfo.length}`)

        // 计算全局章节编号：从数据库获取前面所有卷的章节数（避免依赖可能过时的 store 数据）
        let chaptersBeforeCurrentVolume = 0
        for (let i = 0; i < volumeIndex; i++) {
          // 直接从数据库查询每个卷的章节数，确保数据准确
          const volChapters = await window.electron.db.getChapters(volumes[i].id)
          chaptersBeforeCurrentVolume += volChapters.length
        }

        // 追加模式：前面卷 + 当前卷已有 + 1
        const startChapterNumber = chaptersBeforeCurrentVolume + existingChapters.length + 1

        // 准备上下文信息（包含已有章节大纲列表）
        const existingChapterOutlines = existingChapters.length > 0
          ? existingChapters.map(c => `${c.title}: ${c.outline || '(无大纲)'}`)
          : undefined

        const contextInfo = {
          previousVolumeChapters: previousVolumeChapters.length > 0 ? previousVolumeChapters : undefined,
          previousVolumeSummary: previousVolumeSummary || undefined,
          nextVolumeSummary: nextVolumeSummary || undefined,
          nextVolumeDetails: nextVolumeDetails || undefined,
          writtenChaptersSummary: writtenChaptersSummary.length > 0 ? writtenChaptersSummary : undefined,
          existingChapterOutlines: existingChapterOutlines
        }

        console.log('🤖 [大纲生成] 开始调用 API（批量模式）...')
        console.log(`⚡ [大纲生成] 智能压缩: ${useCompression ? '已启用' : '已禁用'}`)
        generatedChapters = await generateVolumeChapters(
          currentProject.worldSetting,
          characterInfo,
          { title: volume.title, summary: volume.summary },
          volumeIndex,
          totalVolumes,
          currentProject.genres,
          currentProject.styles,
          generateChapterCount,
          startChapterNumber,
          generateGuidance,
          characterArchives,  // 传入完整角色档案
          contextInfo,  // 传入上下文信息
          useCompression,  // 启用智能压缩
          volumes  // 传入所有卷信息
        )
        console.log(`✅ [大纲生成] API 调用成功，生成了 ${generatedChapters.length} 章`)
      }

      setGeneratingProgress(85)
      console.log('💾 [大纲生成] 开始保存章节到数据库...')

      // 使用批量创建方法（事务保证原子性，防止并发时序号重复）
      try {
        const chaptersToCreate = generatedChapters.map(ch => ({
          volumeId,
          title: ch.title,
          outline: ch.outline
        }))

        // 批量创建章节（内部使用事务，确保所有章节序号连续且不重复）
        const createdChapters = await (window.electron.db as any).createChaptersBatch(chaptersToCreate)
        console.log(`✅ [大纲生成] 成功保存 ${createdChapters.length} 个章节`)

        setGeneratingProgress(90)
      } catch (saveError: any) {
        // 批量创建失败，事务会自动回滚，无需手动清理
        console.error('❌ [大纲生成] 批量保存章节失败:', saveError)
        throw new Error(`保存章节失败: ${saveError.message}`)
      }

      setGeneratingProgress(95)
      console.log('🔄 [大纲生成] 重新加载所有章节...')

      // 重新加载所有卷的章节（避免只加载当前卷导致其他卷章节消失）
      if (currentProject) {
        await loadAllChapters(currentProject.id)
      }

      setGeneratingProgress(100)
      console.log('🎉 [大纲生成] 生成完成！')

      const modeText = generateMode === 'oneByOne' ? '(逐章)' : '(批量)'

      // 检查是否有边界验证警告
      const validationResult = (generatedChapters as any).__validationResult
      if (validationResult && !validationResult.isValid) {
        // 有边界问题，显示警告
        const errorCount = validationResult.errors?.length || 0
        const warningCount = validationResult.warnings?.length || 0
        modal.warning({
          title: '大纲边界检测警告',
          width: 600,
          content: (
            <div style={{ maxHeight: 400, overflow: 'auto' }}>
              <p style={{ marginBottom: 16 }}>
                生成的大纲存在以下边界问题，建议人工检查并修正：
              </p>
              {validationResult.errors?.map((err: any, i: number) => (
                <div key={i} style={{
                  padding: '8px 12px',
                  marginBottom: 8,
                  background: err.severity === 'high' ? '#fff2f0' : '#fffbe6',
                  border: `1px solid ${err.severity === 'high' ? '#ffccc7' : '#ffe58f'}`,
                  borderRadius: 4
                }}>
                  <div style={{ fontWeight: 500 }}>
                    {err.type === 'past_repeat' ? '🔙' : '⏩'} 第{err.chapterNumber}章《{err.chapterTitle}》
                  </div>
                  <div style={{ fontSize: 12, color: '#666', marginTop: 4 }}>
                    {err.description}
                    {err.conflictSource && <span> → 冲突来源：{err.conflictSource}</span>}
                  </div>
                </div>
              ))}
              {warningCount > 0 && (
                <div style={{ marginTop: 12, color: '#666', fontSize: 12 }}>
                  另有 {warningCount} 个轻微警告
                </div>
              )}
            </div>
          )
        })
        message.warning(`${modeText} 生成 ${generatedChapters.length} 章，发现 ${errorCount} 个边界问题`)
      } else {
        message.success(`${modeText} 成功追加生成 ${generatedChapters.length} 章大纲！`)
      }

      // 清空指导意见
      setGenerateGuidance('')
    } catch (error: any) {
      console.error('❌ [大纲生成] 生成失败:', error)
      console.error('❌ 错误详情:', {
        message: error.message,
        stack: error.stack,
        volumeId,
        volumeTitle: volume.title,
        mode: 'append'
      })

      // 显示更详细的错误信息
      const errorMessage = error.message || String(error)
      if (errorMessage.includes('429') || errorMessage.includes('quota') || errorMessage.includes('配额')) {
        message.error({
          content: '⚠️ API 配额已用尽，请稍后重试或在全局设置中切换模型',
          duration: 6
        })
      } else if (errorMessage.includes('invalid') || errorMessage.includes('401') || errorMessage.includes('API Key')) {
        message.error({
          content: '❌ API Key 无效，请检查全局设置',
          duration: 6
        })
      } else if (errorMessage.includes('fetch') || errorMessage.includes('网络') || errorMessage.includes('超时')) {
        message.error({
          content: (
            <div>
              <div>🌐 网络连接失败，请检查：</div>
              <div style={{ marginTop: 4, fontSize: 12, opacity: 0.8 }}>
                1. 网络是否正常<br />
                2. 是否需要代理访问 Google API<br />
                3. 防火墙是否阻止了请求
              </div>
            </div>
          ),
          duration: 8
        })
      } else if (errorMessage.includes('回滚')) {
        message.error({
          content: '❌ 保存失败，已自动回滚。请重试',
          duration: 5
        })
      } else {
        message.error({
          content: `生成失败: ${errorMessage}`,
          duration: 5
        })
      }
    } finally {
      // 清除数据库锁
      try {
        await window.electron.db.clearGeneratingLock(volumeId)
        console.log('🔓 [大纲生成] 已清除数据库锁')
      } catch (unlockError) {
        console.error('⚠️ [大纲生成] 清除锁失败:', unlockError)
      }

      // 清除前端锁
      setGeneratingVolumeId(null)
      setGeneratingProgress(0)
      // 清除全局生成状态
      setGenerating(false)
    }
  }

  // 添加卷
  const handleAddVolume = async () => {
    if (!newVolumeData.title.trim() || !projectId) return

    await createVolume({
      projectId,
      title: newVolumeData.title,
      summary: newVolumeData.summary
    })
    setNewVolumeData({ title: '', summary: '' })
    setIsAddVolumeModalOpen(false)
    message.success('卷添加成功')
  }

  // 添加单个章节
  const handleAddChapter = async (volumeId: string) => {
    // 计算全局章节编号
    const volumeIndex = volumes.findIndex(v => v.id === volumeId)
    let chaptersBeforeCurrentVolume = 0
    for (let i = 0; i < volumeIndex; i++) {
      const volChapters = chapters.filter(c => c.volumeId === volumes[i].id)
      chaptersBeforeCurrentVolume += volChapters.length
    }

    await createChapter({
      volumeId,
      title: '未命名',
      outline: ''
    })
    if (currentProject) {
      await loadAllChapters(currentProject.id)
    }
    message.success('章节添加成功')
  }

  // 清空本卷所有章节
  const handleClearVolumeChapters = async (volumeId: string, volumeTitle: string) => {
    const volumeChapters = chapters.filter(c => c.volumeId === volumeId)

    if (volumeChapters.length === 0) {
      message.info('本卷暂无章节')
      return
    }

    modal.confirm({
      title: '确认清空本卷所有章节',
      content: `即将删除"${volumeTitle}"的所有 ${volumeChapters.length} 章及其内容，此操作不可恢复！是否继续？`,
      okText: '确认清空',
      okType: 'danger',
      cancelText: '取消',
      onOk: async () => {
        const hideLoading = message.loading('正在清空章节...', 0)
        try {
          for (const chapter of volumeChapters) {
            await deleteChapter(chapter.id)
          }

          // 重新加载所有章节
          if (currentProject) {
            await loadAllChapters(currentProject.id)
          }

          hideLoading()
          message.success(`已清空 ${volumeChapters.length} 章`)
        } catch (error) {
          hideLoading()
          message.error('清空失败，请重试')
        }
      }
    })
  }

  // 保存章节大纲
  const handleSaveChapterOutline = async () => {
    if (!editingChapter) return

    await updateChapter(editingChapter.id, {
      title: editingChapter.title,
      outline: editingChapter.outline
    })
    setEditingChapter(null)
    message.success('保存成功')
  }

  // 下载分卷为 zip
  const handleDownloadVolume = async (volumeId: string, volumeTitle: string, volumeIdx: number) => {
    const volumeChapters = chapters
      .filter((c) => c.volumeId === volumeId)
      .sort((a, b) => a.order - b.order)

    if (volumeChapters.length === 0) {
      message.warning('该卷暂无章节可下载')
      return
    }

    // 检查是否有正文内容
    const chaptersWithContent = volumeChapters.filter(c => c.content && c.content.trim())
    if (chaptersWithContent.length === 0) {
      message.warning('该卷章节暂无正文内容可下载')
      return
    }

    const hideLoading = message.loading('正在打包下载...', 0)

    try {
      const zip = new JSZip()
      const volumeName = `第${volumeIdx + 1}卷_${volumeTitle}`

      // 为每个有内容的章节创建 txt 文件
      volumeChapters.forEach((chapter) => {
        if (chapter.content && chapter.content.trim()) {
          // 文件名格式：第X章 标题.txt（使用全书章节编号）
          const globalChapterNum = getGlobalChapterNumber(chapter)
          const cleanTitle = cleanChapterTitle(chapter.title)
          const chapterTitle = `第${globalChapterNum}章 ${cleanTitle}`
          const fileName = `${chapterTitle.replace(/[\\/:*?"<>|]/g, '_')}.txt`

          // 文件内容：只有正文，不包含章节标题
          const content = chapter.content
          zip.file(fileName, content)
        }
      })

      // 生成 zip 文件
      const blob = await zip.generateAsync({ type: 'blob' })
      saveAs(blob, `${volumeName}.zip`)

      hideLoading()
      message.success(`已下载 ${chaptersWithContent.length} 章内容`)
    } catch (error: any) {
      hideLoading()
      console.error('Download error:', error)
      message.error('下载失败，请重试')
    }
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
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-dark-text mb-1">大纲管理</h1>
          <p className="text-dark-muted">
            共 {volumes.length} 卷，{chapters.length} 章
          </p>
        </div>
        <Space>
          <Tooltip title="刷新数据（如果卷列表显示不正常，点击此按钮）">
            <Button
              icon={<ReloadOutlined spin={isRefreshing} />}
              onClick={handleRefreshData}
              loading={isRefreshing}
            >
              刷新
            </Button>
          </Tooltip>
          {volumes.length > 0 && (
            <Tooltip title="为所有卷提取核心要点，提升一致性并节约60%+ token">
              <Button
                icon={<ThunderboltOutlined />}
                onClick={handleExtractAllKeyPoints}
                loading={isExtractingKeyPoints}
              >
                {isExtractingKeyPoints ? `提取中 ${extractProgress}%` : '智能优化'}
              </Button>
            </Tooltip>
          )}
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => setIsAddVolumeModalOpen(true)}
          >
            添加卷
          </Button>
        </Space>
      </div>

      {/* 灵感摘要 */}
      <Card
        className="mb-6"
        style={{ background: '#16213e', border: '1px solid #0f3460' }}
      >
        <h3 className="text-lg font-medium text-dark-text mb-2">核心灵感</h3>
        <p className="text-dark-muted mb-3">{currentProject.inspiration || '未设置'}</p>
        <div className="flex gap-2 flex-wrap">
          <Tag color="purple">{currentProject.scale === 'micro' ? '微小说' : '百万巨著'}</Tag>
          {currentProject.genres.map((genre) => (
            <Tag key={genre} color="blue">{genre}</Tag>
          ))}
          {currentProject.styles.map((style) => (
            <Tag key={style} color="cyan">{style}</Tag>
          ))}
        </div>
      </Card>

      {/* 大纲列表 */}
      {volumes.length === 0 ? (
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description="暂无大纲，点击上方按钮开始规划"
        >
          <Button type="primary" onClick={() => setIsAddVolumeModalOpen(true)}>
            创建第一卷
          </Button>
        </Empty>
      ) : (
        <Collapse
          defaultActiveKey={volumes.slice(0, 3).map((v) => v.id)}
          className="bg-transparent border-none"
        >
          {volumes.map((volume, volumeIdx) => {
            const volumeChapters = chapters
              .filter((c) => c.volumeId === volume.id)
              .sort((a, b) => a.order - b.order)

            const isGenerating = generatingVolumeId === volume.id

            return (
              <Panel
                key={volume.id}
                header={
                  <div className="flex items-center justify-between w-full pr-4">
                    <div className="flex items-center gap-3">
                      <span className="text-lg font-medium">
                        第{volumeIdx + 1}卷 {volume.title}
                      </span>
                      <Tag color={volumeChapters.length > 0 ? 'green' : 'orange'}>
                        {volumeChapters.length} 章
                      </Tag>
                    </div>
                    <Space onClick={(e) => e.stopPropagation()}>
                      <Tooltip title="AI生成本卷章节大纲">
                        <Button
                          type="primary"
                          size="small"
                          icon={isGenerating ? <SyncOutlined spin /> : <ThunderboltOutlined />}
                          onClick={() => setShowGenerateModal(volume.id)}
                          loading={isGenerating}
                        >
                          生成章节
                        </Button>
                      </Tooltip>
                      <Tooltip title="下载本卷（每章为一个txt文件）">
                        <Button
                          type="text"
                          size="small"
                          icon={<DownloadOutlined />}
                          onClick={() => handleDownloadVolume(volume.id, volume.title, volumeIdx)}
                        />
                      </Tooltip>
                      <Tooltip title="添加章节">
                        <Button
                          type="text"
                          size="small"
                          icon={<PlusOutlined />}
                          onClick={() => handleAddChapter(volume.id)}
                        />
                      </Tooltip>
                      <Tooltip title="清空本卷所有章节">
                        <Button
                          type="text"
                          size="small"
                          icon={<ClearOutlined />}
                          onClick={() => handleClearVolumeChapters(volume.id, volume.title)}
                          disabled={volumeChapters.length === 0}
                          danger
                        />
                      </Tooltip>
                      <Tooltip title="删除卷">
                        <Popconfirm
                          title="确认删除"
                          description={`确定要删除"${volume.title}"及其所有章节吗？`}
                          onConfirm={() => deleteVolume(volume.id)}
                          okText="删除"
                          cancelText="取消"
                        >
                          <Button
                            type="text"
                            size="small"
                            danger
                            icon={<DeleteOutlined />}
                          />
                        </Popconfirm>
                      </Tooltip>
                    </Space>
                  </div>
                }
                className="mb-2"
                style={{
                  background: '#16213e',
                  border: '1px solid #0f3460',
                  borderRadius: 8
                }}
              >
                {/* 卷简介 */}
                {volume.summary && (
                  <div className="mb-4 p-3 bg-dark-bg rounded-lg">
                    <span className="text-dark-muted text-sm">{volume.summary}</span>
                  </div>
                )}

                {/* 生成进度 */}
                {isGenerating && (
                  <div className="mb-4">
                    <Progress
                      percent={generatingProgress}
                      status="active"
                      strokeColor={{
                        '0%': '#0ea5e9',
                        '100%': '#0284c7'
                      }}
                    />
                    <p className="text-dark-muted text-sm mt-2">正在生成章节大纲...</p>
                  </div>
                )}

                {/* 章节列表 */}
                {volumeChapters.length === 0 && !isGenerating ? (
                  <Empty
                    image={Empty.PRESENTED_IMAGE_SIMPLE}
                    description="暂无章节"
                  >
                    <Space>
                      <Button
                        type="primary"
                        size="small"
                        icon={<ThunderboltOutlined />}
                        onClick={() => setShowGenerateModal(volume.id)}
                      >
                        AI生成章节
                      </Button>
                      <Button
                        size="small"
                        onClick={() => handleAddChapter(volume.id)}
                      >
                        手动添加
                      </Button>
                    </Space>
                  </Empty>
                ) : (
                  <div className="space-y-2">
                    {volumeChapters.map((chapter, chapterIdx) => (
                      <Card
                        key={chapter.id}
                        size="small"
                        className="hover-card"
                        style={{
                          background: '#0f0f1a',
                          border: '1px solid #0f3460'
                        }}
                      >
                        <div className="flex items-start gap-4">
                          {/* 章节编号 */}
                          <div className="flex-shrink-0 w-12 h-12 flex items-center justify-center bg-primary-500/20 rounded-lg">
                            <span className="text-primary-400 font-bold">
                              {chapterIdx + 1}
                            </span>
                          </div>

                          {/* 章节内容 */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="font-medium text-dark-text truncate">
                                第{getGlobalChapterNumber(chapter)}章 {cleanChapterTitle(chapter.title)}
                              </span>
                              {chapter.content && (
                                <Tooltip title="已写正文">
                                  <CheckCircleOutlined className="text-green-500 flex-shrink-0" />
                                </Tooltip>
                              )}
                              {chapter.wordCount > 0 && (
                                <span className="text-dark-muted text-xs flex-shrink-0">
                                  {chapter.wordCount} 字
                                </span>
                              )}
                            </div>
                            <p className="text-dark-muted text-sm line-clamp-2">
                              {chapter.outline || '暂无大纲，点击编辑添加'}
                            </p>
                          </div>

                          {/* 操作按钮 */}
                          <Space className="flex-shrink-0">
                            <Tooltip title="编辑大纲">
                              <Button
                                type="text"
                                size="small"
                                icon={<EditOutlined />}
                                onClick={() =>
                                  setEditingChapter({
                                    id: chapter.id,
                                    title: chapter.title,
                                    outline: chapter.outline
                                  })
                                }
                              />
                            </Tooltip>
                            <Tooltip title="删除">
                              <Popconfirm
                                title="确认删除"
                                description={`确定要删除"${chapter.title}"吗？`}
                                onConfirm={() => deleteChapter(chapter.id)}
                                okText="删除"
                                cancelText="取消"
                              >
                                <Button
                                  type="text"
                                  size="small"
                                  danger
                                  icon={<DeleteOutlined />}
                                />
                              </Popconfirm>
                            </Tooltip>
                          </Space>
                        </div>
                      </Card>
                    ))}
                  </div>
                )}
              </Panel>
            )
          })}
        </Collapse>
      )}

      {/* 添加卷对话框 */}
      <Modal
        title="添加新卷"
        open={isAddVolumeModalOpen}
        onOk={handleAddVolume}
        onCancel={() => setIsAddVolumeModalOpen(false)}
        okText="添加"
        cancelText="取消"
      >
        <div className="space-y-4">
          <div>
            <label className="block text-dark-text mb-2">卷名</label>
            <Input
              placeholder="例如：崛起之路"
              value={newVolumeData.title}
              onChange={(e) => setNewVolumeData({ ...newVolumeData, title: e.target.value })}
            />
          </div>
          <div>
            <label className="block text-dark-text mb-2">卷简介（可选）</label>
            <TextArea
              rows={3}
              placeholder="描述本卷的主要剧情..."
              value={newVolumeData.summary}
              onChange={(e) => setNewVolumeData({ ...newVolumeData, summary: e.target.value })}
            />
          </div>
        </div>
      </Modal>

      {/* 生成章节对话框 */}
      <Modal
        title="AI生成章节大纲"
        open={!!showGenerateModal}
        onCancel={() => {
          setShowGenerateModal(null)
          setGenerateGuidance('')
        }}
        footer={null}
        width={600}
      >
        <div className="space-y-4">
          <p className="text-dark-muted">
            AI将为本卷生成详细的章节大纲，每章包含编号、标题和剧情概要。
          </p>

          {/* 生成模式选择 */}
          <div>
            <label className="block text-dark-text mb-2">生成模式</label>
            <Radio.Group
              value={generateMode}
              onChange={(e) => setGenerateMode(e.target.value)}
              className="w-full"
            >
              <Radio.Button value="oneByOne" className="w-1/2 text-center">
                逐章生成（省token）
              </Radio.Button>
              <Radio.Button value="batch" className="w-1/2 text-center">
                批量生成
              </Radio.Button>
            </Radio.Group>
            <p className="text-dark-muted text-xs mt-1">
              {generateMode === 'oneByOne'
                ? '逐章生成，节约token，但可能出现内容冲突'
                : '🔥 推荐：一次性生成所有章节，分析全书结构，避免内容冲突和重复'}
            </p>
          </div>

          {/* 智能压缩选项 */}
          {generateMode === 'batch' && (
            <div className="bg-[#0f3460] p-4 rounded-lg border border-[#1a4d7a]">
              <div className="flex items-center justify-between mb-2">
                <label className="text-dark-text font-medium">⚡ 智能压缩</label>
                <Radio.Group
                  value={useCompression}
                  onChange={(e) => setUseCompression(e.target.value)}
                  size="small"
                >
                  <Radio.Button value={true}>启用</Radio.Button>
                  <Radio.Button value={false}>禁用</Radio.Button>
                </Radio.Group>
              </div>
              <div className="text-xs space-y-1">
                {useCompression ? (
                  <>
                    <p className="text-green-400">
                      ✓ 已启用智能压缩（推荐）
                    </p>
                    <p className="text-dark-muted">
                      • 节约60%+ token消耗<br />
                      • 提升全书逻辑一致性<br />
                      • 避免大纲重复和冲突<br />
                      • 使用全书卷索引替代冗长上下文
                    </p>
                  </>
                ) : (
                  <>
                    <p className="text-yellow-400">
                      ⚠ 已禁用压缩（不推荐）
                    </p>
                    <p className="text-dark-muted">
                      将使用完整上下文，token消耗较高
                    </p>
                  </>
                )}
              </div>
            </div>
          )}

          <div>
            <label className="block text-dark-text mb-2">生成章节数量</label>
            <InputNumber
              min={5}
              max={100}
              value={generateChapterCount}
              onChange={(value) => setGenerateChapterCount(value || 40)}
              className="w-full"
            />
            <p className="text-dark-muted text-xs mt-1">
              微小说建议 5-8 章，百万巨著建议每卷 40+ 章
            </p>
          </div>

          {/* 指导意见输入 */}
          <div>
            <label className="block text-dark-text mb-2">
              指导意见（可选）
            </label>
            <TextArea
              rows={4}
              placeholder="输入对大纲生成的指导意见，例如：&#10;&#10;- 本卷需要安排一场大战&#10;- 主角觉醒新能力&#10;- 增加感情线的描写&#10;- 节奏可以更快一些&#10;- 参考已有大纲的风格..."
              value={generateGuidance}
              onChange={(e) => setGenerateGuidance(e.target.value)}
              className="custom-input"
              showCount
              maxLength={1000}
            />
            <p className="text-dark-muted text-xs mt-1">
              可以基于已有大纲提出修改建议，AI将根据指导调整生成内容
            </p>
          </div>

          {/* 操作按钮 */}
          <div className="pt-4 space-y-3">
            {(() => {
              const existingCount = showGenerateModal
                ? chapters.filter(c => c.volumeId === showGenerateModal).length
                : 0
              return (
                <>
                  <Button
                    type="primary"
                    block
                    size="large"
                    icon={<PlusOutlined />}
                    onClick={() => showGenerateModal && handleGenerateVolumeChapters(showGenerateModal)}
                  >
                    {existingCount > 0 ? `追加生成（保留现有 ${existingCount} 章）` : '生成章节大纲'}
                  </Button>
                  {existingCount > 0 && (
                    <p className="text-dark-muted text-xs text-center">
                      💡 如需清空现有章节，请使用卷标题右侧的"清空本卷所有章节"按钮
                    </p>
                  )}
                  <Button
                    block
                    onClick={() => {
                      setShowGenerateModal(null)
                      setGenerateGuidance('')
                    }}
                  >
                    取消
                  </Button>
                </>
              )
            })()}
          </div>
        </div>
      </Modal>

      {/* 编辑章节大纲对话框 */}
      <Modal
        title="编辑章节大纲"
        open={!!editingChapter}
        onOk={handleSaveChapterOutline}
        onCancel={() => setEditingChapter(null)}
        okText="保存"
        cancelText="取消"
        width={700}
      >
        {editingChapter && (
          <div className="space-y-4">
            <div>
              <label className="block text-dark-text mb-2">章节标题</label>
              <Input
                value={editingChapter.title}
                onChange={(e) =>
                  setEditingChapter({ ...editingChapter, title: e.target.value })
                }
                placeholder="标题（不含章节编号）"
              />
            </div>
            <div>
              <label className="block text-dark-text mb-2">章节大纲</label>
              <TextArea
                rows={8}
                value={editingChapter.outline}
                onChange={(e) =>
                  setEditingChapter({ ...editingChapter, outline: e.target.value })
                }
                placeholder="详细描述本章的：&#10;1. 场景设定&#10;2. 人物行动&#10;3. 核心冲突&#10;4. 章末悬念"
                showCount
              />
              <p className="text-dark-muted text-xs mt-1">
                建议 80-150 字，要能支撑 2500 字的正文内容
              </p>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}

export default Outline
