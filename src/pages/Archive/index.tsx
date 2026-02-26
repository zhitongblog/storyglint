import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { Card, Table, Tag, Spin, Button, message, Progress, Tooltip, Modal } from 'antd'
import { RobotOutlined, SyncOutlined, ReloadOutlined, TeamOutlined } from '@ant-design/icons'
import type { ColumnsType } from 'antd/es/table'
import { useProjectStore } from '../../stores/project'
import { generateSummary, isGeminiReady, initGemini, analyzeAllChaptersForArchive } from '../../services/gemini'
import { getConfiguredApiKey } from '../../utils'
import type { Character, CharacterRelation } from '../../types'

const roleLabels: Record<string, { text: string; color: string }> = {
  protagonist: { text: '主角', color: 'gold' },
  supporting: { text: '配角', color: 'blue' },
  antagonist: { text: '反派', color: 'red' }
}

const statusLabels: Record<string, { text: string; color: string }> = {
  active: { text: '活跃', color: 'green' },
  pending: { text: '待登场', color: 'orange' },
  deceased: { text: '已故', color: 'default' }
}

function Archive() {
  const { projectId } = useParams<{ projectId: string }>()
  const { currentProject, characters, chapters, volumes, loadProject, updateProject, updateCharacter, loadCharacters } =
    useProjectStore()

  const [isGeneratingSummary, setIsGeneratingSummary] = useState(false)
  const [isUpdatingArchive, setIsUpdatingArchive] = useState(false)
  const [updateProgress, setUpdateProgress] = useState({ current: 0, total: 0 })
  const [showRelationsModal, setShowRelationsModal] = useState<Character | null>(null)

  useEffect(() => {
    if (projectId) {
      loadProject(projectId)
    }
  }, [projectId, loadProject])

  useEffect(() => {
    const initApi = async () => {
      const apiKey = await getConfiguredApiKey()
      if (apiKey) {
        await initGemini(apiKey)
      }
    }
    initApi()
  }, [])

  // 计算统计数据
  const totalWords = chapters.reduce((sum, ch) => sum + ch.wordCount, 0)
  const totalChapters = chapters.length
  const totalVolumes = volumes.length
  const totalCharacters = characters.length

  // AI 自动更新角色档案（生死、出场、关系）
  const handleUpdateCharacterArchive = async () => {
    if (!currentProject || !projectId) return

    if (!isGeminiReady()) {
      message.warning('请先在设置中配置 Gemini API Key')
      return
    }

    // 收集所有有内容的章节
    const chaptersWithContent = chapters
      .filter(ch => ch.content && ch.content.trim())
      .sort((a, b) => a.order - b.order)

    if (chaptersWithContent.length === 0) {
      message.warning('暂无正文内容，无法分析角色档案')
      return
    }

    const characterNames = characters.map(c => c.name)
    if (characterNames.length === 0) {
      message.warning('暂无角色，请先创建角色')
      return
    }

    setIsUpdatingArchive(true)
    setUpdateProgress({ current: 0, total: chaptersWithContent.length })

    try {
      const result = await analyzeAllChaptersForArchive(
        chaptersWithContent.map(ch => ({ title: ch.title, content: ch.content })),
        characterNames,
        (current, total) => setUpdateProgress({ current, total })
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
      message.success(`已分析 ${chaptersWithContent.length} 章，更新 ${result.characterUpdates.length} 个角色档案`)
    } catch (error: any) {
      message.error(error.message || '分析失败，请重试')
    } finally {
      setIsUpdatingArchive(false)
      setUpdateProgress({ current: 0, total: 0 })
    }
  }

  // AI 生成摘要
  const handleGenerateSummary = async () => {
    if (!currentProject || !projectId) return

    if (!isGeminiReady()) {
      message.warning('请先在设置中配置 Gemini API Key')
      return
    }

    // 收集所有章节内容
    const allContent = chapters
      .sort((a, b) => {
        const volumeA = volumes.find((v) => v.id === a.volumeId)
        const volumeB = volumes.find((v) => v.id === b.volumeId)
        if (volumeA?.order !== volumeB?.order) {
          return (volumeA?.order || 0) - (volumeB?.order || 0)
        }
        return a.order - b.order
      })
      .map((ch) => ch.content)
      .filter(Boolean)
      .join('\n\n')

    if (!allContent) {
      message.warning('暂无正文内容，无法生成摘要')
      return
    }

    setIsGeneratingSummary(true)
    try {
      const summary = await generateSummary(allContent.slice(0, 10000))
      await updateProject(projectId, { summary })
      message.success('摘要生成成功')
    } catch (error: any) {
      message.error(error.message || '生成失败')
    } finally {
      setIsGeneratingSummary(false)
    }
  }

  // 角色表格列定义
  const columns: ColumnsType<Character> = [
    {
      title: '姓名',
      dataIndex: 'name',
      key: 'name',
      width: 100,
      fixed: 'left'
    },
    {
      title: '类型',
      dataIndex: 'role',
      key: 'role',
      width: 70,
      render: (role: string) => (
        <Tag color={roleLabels[role]?.color}>{roleLabels[role]?.text}</Tag>
      )
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 90,
      render: (status: string, record: Character) => (
        <Tooltip title={record.deathChapter ? `死于：${record.deathChapter}` : ''}>
          <Tag color={statusLabels[status]?.color}>
            {statusLabels[status]?.text}
            {status === 'deceased' && record.deathChapter && ' †'}
          </Tag>
        </Tooltip>
      )
    },
    {
      title: '身份',
      dataIndex: 'identity',
      key: 'identity',
      width: 120,
      ellipsis: true
    },
    {
      title: '出场章节',
      dataIndex: 'appearances',
      key: 'appearances',
      width: 150,
      render: (appearances: string[]) => {
        if (!appearances || appearances.length === 0) {
          return <span className="text-dark-muted">未出场</span>
        }
        const count = appearances.length
        return (
          <Tooltip title={appearances.join('、')}>
            <span className="text-primary-400 cursor-pointer">
              {count} 章 ({appearances[0]?.slice(0, 10)}...)
            </span>
          </Tooltip>
        )
      }
    },
    {
      title: '人物关系',
      dataIndex: 'relationships',
      key: 'relationships',
      width: 120,
      render: (relationships: CharacterRelation[], record: Character) => {
        if (!relationships || relationships.length === 0) {
          return <span className="text-dark-muted">无</span>
        }
        return (
          <Button
            type="link"
            size="small"
            icon={<TeamOutlined />}
            onClick={() => setShowRelationsModal(record)}
          >
            {relationships.length} 个关系
          </Button>
        )
      }
    },
    {
      title: '简介',
      dataIndex: 'description',
      key: 'description',
      ellipsis: true,
      render: (text: string) => (
        <span className="text-dark-muted">{text?.slice(0, 50) || '暂无'}</span>
      )
    }
  ]

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
          <h1 className="text-2xl font-bold text-dark-text mb-1">全书档案</h1>
          <p className="text-dark-muted">《{currentProject.title}》的完整档案</p>
        </div>
        <Button icon={<ReloadOutlined />} onClick={() => loadProject(projectId!)}>
          刷新数据
        </Button>
      </div>

      {/* 统计卡片 */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <Card
          style={{ background: '#16213e', border: '1px solid #0f3460' }}
          bodyStyle={{ padding: 16 }}
        >
          <div className="text-dark-muted text-sm mb-1">总字数</div>
          <div className="text-2xl font-bold text-primary-400">
            {totalWords.toLocaleString()}
          </div>
        </Card>
        <Card
          style={{ background: '#16213e', border: '1px solid #0f3460' }}
          bodyStyle={{ padding: 16 }}
        >
          <div className="text-dark-muted text-sm mb-1">章节数</div>
          <div className="text-2xl font-bold text-green-400">{totalChapters}</div>
        </Card>
        <Card
          style={{ background: '#16213e', border: '1px solid #0f3460' }}
          bodyStyle={{ padding: 16 }}
        >
          <div className="text-dark-muted text-sm mb-1">卷数</div>
          <div className="text-2xl font-bold text-yellow-400">{totalVolumes}</div>
        </Card>
        <Card
          style={{ background: '#16213e', border: '1px solid #0f3460' }}
          bodyStyle={{ padding: 16 }}
        >
          <div className="text-dark-muted text-sm mb-1">角色数</div>
          <div className="text-2xl font-bold text-purple-400">{totalCharacters}</div>
        </Card>
      </div>

      {/* 故事摘要 */}
      <Card
        className="mb-6"
        title={
          <div className="flex items-center justify-between">
            <span>故事摘要</span>
            <Button
              type="link"
              size="small"
              icon={isGeneratingSummary ? <SyncOutlined spin /> : <RobotOutlined />}
              onClick={handleGenerateSummary}
              loading={isGeneratingSummary}
            >
              AI 生成摘要
            </Button>
          </div>
        }
        style={{ background: '#16213e', border: '1px solid #0f3460' }}
      >
        <p className="text-dark-text">
          {currentProject.summary || '暂无摘要，点击右上角按钮让 AI 自动生成'}
        </p>
      </Card>

      {/* 人物档案表 */}
      <Card
        title={
          <div className="flex items-center justify-between">
            <span>人物档案表</span>
            <Button
              type="primary"
              size="small"
              icon={isUpdatingArchive ? <SyncOutlined spin /> : <RobotOutlined />}
              onClick={handleUpdateCharacterArchive}
              loading={isUpdatingArchive}
            >
              AI 更新档案
            </Button>
          </div>
        }
        style={{ background: '#16213e', border: '1px solid #0f3460' }}
      >
        {isUpdatingArchive && updateProgress.total > 0 && (
          <div className="mb-4">
            <Progress
              percent={Math.floor((updateProgress.current / updateProgress.total) * 100)}
              status="active"
              strokeColor={{ '0%': '#0ea5e9', '100%': '#0284c7' }}
            />
            <p className="text-dark-muted text-sm">
              正在分析第 {updateProgress.current}/{updateProgress.total} 章...
            </p>
          </div>
        )}
        <Table
          columns={columns}
          dataSource={characters}
          rowKey="id"
          pagination={false}
          scroll={{ x: 900 }}
          locale={{ emptyText: '暂无角色数据' }}
        />
      </Card>

      {/* 人物关系弹窗 */}
      <Modal
        title={`${showRelationsModal?.name} 的人物关系`}
        open={!!showRelationsModal}
        onCancel={() => setShowRelationsModal(null)}
        footer={null}
        width={500}
      >
        {showRelationsModal?.relationships && showRelationsModal.relationships.length > 0 ? (
          <div className="space-y-3">
            {showRelationsModal.relationships.map((rel, idx) => (
              <div
                key={idx}
                className="flex items-center justify-between p-3 bg-dark-bg rounded-lg"
              >
                <span className="text-dark-text font-medium">{rel.targetName}</span>
                <Tag color="blue">{rel.relation}</Tag>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-dark-muted text-center py-4">暂无关系记录</p>
        )}
      </Modal>
    </div>
  )
}

export default Archive
