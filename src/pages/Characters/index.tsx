import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import {
  Card,
  Button,
  Modal,
  Input,
  Select,
  message,
  Spin,
  Empty,
  Tag,
  Avatar,
  Tabs,
  Space,
  Tooltip
} from 'antd'
import {
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  UserOutlined,
  RobotOutlined,
  SyncOutlined
} from '@ant-design/icons'
import { useProjectStore } from '../../stores/project'
import { generateCharacter, isGeminiReady, initGemini } from '../../services/gemini'
import { analyzeAllChapterAppearances } from '../../services/character-utils'
import type { Character } from '../../types'

const { TextArea } = Input

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

function Characters() {
  const { projectId } = useParams<{ projectId: string }>()
  const {
    currentProject,
    characters,
    chapters,
    loadProject,
    createCharacter,
    updateCharacter,
    deleteCharacter
  } = useProjectStore()

  const [isModalOpen, setIsModalOpen] = useState(false)
  const [isGenerating, setIsGenerating] = useState(false)
  const [isFixingStatus, setIsFixingStatus] = useState(false)
  const [editingCharacter, setEditingCharacter] = useState<Partial<Character> | null>(
    null
  )
  const [activeTab, setActiveTab] = useState('all')

  useEffect(() => {
    if (projectId) {
      loadProject(projectId)
    }
  }, [projectId, loadProject])

  useEffect(() => {
    const initApi = async () => {
      const apiKey = await window.electron.settings.get('geminiApiKey')
      if (apiKey) {
        await initGemini(apiKey)
      }
    }
    initApi()
  }, [])

  // 过滤角色
  const filteredCharacters = characters.filter((c) => {
    if (activeTab === 'all') return true
    return c.role === activeTab
  })

  // 打开新建对话框
  const handleOpenCreate = () => {
    setEditingCharacter({
      projectId,
      name: '',
      role: 'supporting',
      gender: '',
      age: '',
      identity: '',
      description: '',
      arc: '',
      status: 'pending'
    })
    setIsModalOpen(true)
  }

  // 打开编辑对话框
  const handleOpenEdit = (character: Character) => {
    setEditingCharacter({ ...character })
    setIsModalOpen(true)
  }

  // 保存角色
  const handleSave = async () => {
    if (!editingCharacter?.name?.trim()) {
      message.warning('请输入角色名称')
      return
    }

    if (editingCharacter.id) {
      await updateCharacter(editingCharacter.id, editingCharacter)
      message.success('角色更新成功')
    } else {
      await createCharacter(editingCharacter)
      message.success('角色创建成功')
    }
    setIsModalOpen(false)
    setEditingCharacter(null)
  }

  // AI 生成角色设定
  const handleAiGenerate = async () => {
    if (!editingCharacter?.name?.trim()) {
      message.warning('请先输入角色名称')
      return
    }

    if (!isGeminiReady()) {
      message.warning('请先在设置中配置 Gemini API Key')
      return
    }

    setIsGenerating(true)
    try {
      const setting = await generateCharacter(
        editingCharacter.name,
        editingCharacter.role || 'supporting',
        currentProject?.inspiration || ''
      )
      setEditingCharacter({
        ...editingCharacter,
        description: setting
      })
      message.success('AI 生成完成')
    } catch (error: any) {
      message.error(error.message || '生成失败')
    } finally {
      setIsGenerating(false)
    }
  }

  // 删除角色
  const handleDelete = (character: Character) => {
    Modal.confirm({
      title: '确认删除',
      content: `确定要删除角色"${character.name}"吗？`,
      okText: '删除',
      okType: 'danger',
      cancelText: '取消',
      onOk: () => deleteCharacter(character.id)
    })
  }

  // 批量修复角色状态（扫描所有章节）
  const handleFixCharacterStatus = async () => {
    if (characters.length === 0) {
      message.warning('暂无角色')
      return
    }

    if (chapters.length === 0) {
      message.warning('暂无章节内容，无法扫描')
      return
    }

    setIsFixingStatus(true)
    try {
      // 收集所有章节正文
      const chaptersContent = chapters
        .filter(c => c.content && c.content.trim())
        .map(c => c.content)

      if (chaptersContent.length === 0) {
        message.warning('所有章节均无正文内容')
        setIsFixingStatus(false)
        return
      }

      // 分析出场情况
      const analysis = analyzeAllChapterAppearances(chaptersContent, characters)

      // 找出需要更新的角色
      const toUpdate = analysis.filter(a => a.shouldBeActive)

      if (toUpdate.length === 0) {
        message.info('所有角色状态已正确，无需修复')
        setIsFixingStatus(false)
        return
      }

      // 显示确认对话框
      Modal.confirm({
        title: '修复角色状态',
        width: 500,
        content: (
          <div>
            <p style={{ marginBottom: 12 }}>
              扫描了 {chaptersContent.length} 章内容，发现以下 {toUpdate.length} 个角色状态需要修复：
            </p>
            <div style={{ maxHeight: 200, overflow: 'auto' }}>
              {toUpdate.map((item, i) => (
                <div key={i} style={{ padding: '4px 0', borderBottom: '1px solid #0f3460' }}>
                  <strong>{item.characterName}</strong>
                  <span style={{ marginLeft: 8, color: '#888' }}>
                    出现 {item.appearanceCount} 次，当前状态：{statusLabels[item.currentStatus]?.text}
                  </span>
                  <span style={{ marginLeft: 8, color: '#52c41a' }}>
                    → 将更新为"活跃"
                  </span>
                </div>
              ))}
            </div>
          </div>
        ),
        okText: '确认修复',
        cancelText: '取消',
        onOk: async () => {
          // 批量更新
          let successCount = 0
          for (const item of toUpdate) {
            try {
              await updateCharacter(item.characterId, { status: 'active' })
              successCount++
            } catch (err) {
              console.error(`更新角色 ${item.characterName} 失败:`, err)
            }
          }

          // 重新加载角色
          if (projectId) {
            await loadProject(projectId)
          }

          message.success(`成功修复 ${successCount} 个角色状态`)
        },
        onCancel: () => {
          setIsFixingStatus(false)
        }
      })
    } catch (error: any) {
      console.error('修复角色状态失败:', error)
      message.error('修复失败: ' + error.message)
    } finally {
      setIsFixingStatus(false)
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
          <h1 className="text-2xl font-bold text-dark-text mb-1">角色核心</h1>
          <p className="text-dark-muted">管理你故事中的所有角色</p>
        </div>
        <Space>
          <Tooltip title="扫描所有章节，自动更新已出场角色状态">
            <Button
              icon={<SyncOutlined spin={isFixingStatus} />}
              onClick={handleFixCharacterStatus}
              loading={isFixingStatus}
            >
              修复状态
            </Button>
          </Tooltip>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={handleOpenCreate}
            className="gradient-button"
          >
            新建角色
          </Button>
        </Space>
      </div>

      {/* 标签过滤 */}
      <Tabs
        activeKey={activeTab}
        onChange={setActiveTab}
        className="mb-4"
        items={[
          { key: 'all', label: `全部 (${characters.length})` },
          {
            key: 'protagonist',
            label: `主角 (${characters.filter((c) => c.role === 'protagonist').length})`
          },
          {
            key: 'supporting',
            label: `配角 (${characters.filter((c) => c.role === 'supporting').length})`
          },
          {
            key: 'antagonist',
            label: `反派 (${characters.filter((c) => c.role === 'antagonist').length})`
          }
        ]}
      />

      {/* 角色列表 */}
      {filteredCharacters.length === 0 ? (
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description="暂无角色，点击上方按钮创建"
        >
          <Button type="primary" onClick={handleOpenCreate}>
            创建第一个角色
          </Button>
        </Empty>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredCharacters.map((character) => (
            <Card
              key={character.id}
              className="hover-card"
              style={{ background: '#16213e', border: '1px solid #0f3460' }}
              bodyStyle={{ padding: 16 }}
            >
              <div className="flex items-start gap-4">
                <Avatar
                  size={64}
                  icon={<UserOutlined />}
                  style={{
                    backgroundColor:
                      character.role === 'protagonist'
                        ? '#d4a017'
                        : character.role === 'antagonist'
                        ? '#dc3545'
                        : '#1890ff'
                  }}
                />
                <div className="flex-1">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-lg font-medium text-dark-text">
                      {character.name}
                    </h3>
                    <Space>
                      <Tooltip title="编辑">
                        <Button
                          type="text"
                          size="small"
                          icon={<EditOutlined />}
                          onClick={() => handleOpenEdit(character)}
                        />
                      </Tooltip>
                      <Tooltip title="删除">
                        <Button
                          type="text"
                          size="small"
                          danger
                          icon={<DeleteOutlined />}
                          onClick={() => handleDelete(character)}
                        />
                      </Tooltip>
                    </Space>
                  </div>

                  <div className="flex gap-2 mb-2">
                    <Tag color={roleLabels[character.role]?.color}>
                      {roleLabels[character.role]?.text}
                    </Tag>
                    <Tag color={statusLabels[character.status]?.color}>
                      {statusLabels[character.status]?.text}
                    </Tag>
                  </div>

                  <p className="text-dark-muted text-sm mb-2">
                    {character.identity || '身份未设定'}
                  </p>

                  <p className="text-dark-muted text-sm line-clamp-3">
                    {character.description || '暂无详细设定'}
                  </p>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* 编辑对话框 */}
      <Modal
        title={editingCharacter?.id ? '编辑角色' : '新建角色'}
        open={isModalOpen}
        onOk={handleSave}
        onCancel={() => {
          setIsModalOpen(false)
          setEditingCharacter(null)
        }}
        okText="保存"
        cancelText="取消"
        width={700}
      >
        {editingCharacter && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-dark-text mb-2">角色名称 *</label>
                <Input
                  value={editingCharacter.name}
                  onChange={(e) =>
                    setEditingCharacter({ ...editingCharacter, name: e.target.value })
                  }
                  placeholder="输入角色名称"
                />
              </div>
              <div>
                <label className="block text-dark-text mb-2">角色类型</label>
                <Select
                  value={editingCharacter.role}
                  onChange={(value) =>
                    setEditingCharacter({ ...editingCharacter, role: value })
                  }
                  className="w-full"
                  options={[
                    { value: 'protagonist', label: '主角' },
                    { value: 'supporting', label: '配角' },
                    { value: 'antagonist', label: '反派' }
                  ]}
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-dark-text mb-2">性别</label>
                <Input
                  value={editingCharacter.gender}
                  onChange={(e) =>
                    setEditingCharacter({ ...editingCharacter, gender: e.target.value })
                  }
                  placeholder="男/女/其他"
                />
              </div>
              <div>
                <label className="block text-dark-text mb-2">年龄</label>
                <Input
                  value={editingCharacter.age}
                  onChange={(e) =>
                    setEditingCharacter({ ...editingCharacter, age: e.target.value })
                  }
                  placeholder="如：18岁"
                />
              </div>
              <div>
                <label className="block text-dark-text mb-2">状态</label>
                <Select
                  value={editingCharacter.status}
                  onChange={(value) =>
                    setEditingCharacter({ ...editingCharacter, status: value })
                  }
                  className="w-full"
                  options={[
                    { value: 'active', label: '活跃' },
                    { value: 'pending', label: '待登场' },
                    { value: 'deceased', label: '已故' }
                  ]}
                />
              </div>
            </div>

            <div>
              <label className="block text-dark-text mb-2">身份</label>
              <Input
                value={editingCharacter.identity}
                onChange={(e) =>
                  setEditingCharacter({ ...editingCharacter, identity: e.target.value })
                }
                placeholder="角色的社会身份，如：皇帝、学生、刺客"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-dark-text">角色设定</label>
                <Button
                  type="link"
                  size="small"
                  icon={isGenerating ? <SyncOutlined spin /> : <RobotOutlined />}
                  onClick={handleAiGenerate}
                  loading={isGenerating}
                >
                  AI 生成设定
                </Button>
              </div>
              <TextArea
                rows={6}
                value={editingCharacter.description}
                onChange={(e) =>
                  setEditingCharacter({
                    ...editingCharacter,
                    description: e.target.value
                  })
                }
                placeholder="详细描述角色的外貌、性格、背景故事等..."
              />
            </div>

            <div>
              <label className="block text-dark-text mb-2">人物弧光</label>
              <TextArea
                rows={3}
                value={editingCharacter.arc}
                onChange={(e) =>
                  setEditingCharacter({ ...editingCharacter, arc: e.target.value })
                }
                placeholder="描述角色从故事开始到结束的成长变化..."
              />
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}

export default Characters
