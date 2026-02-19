import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Card, Button, Empty, Spin, Tag, Dropdown, App } from 'antd'
import {
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  MoreOutlined,
  BookOutlined
} from '@ant-design/icons'
import { useProjectStore } from '../../stores/project'
import type { Project } from '../../types'
import dayjs from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime'
import 'dayjs/locale/zh-cn'

dayjs.extend(relativeTime)
dayjs.locale('zh-cn')

const scaleLabels: Record<string, string> = {
  micro: '微小说',
  short: '短篇',
  million: '百万长篇',
  three_million: '三百万巨著'
}

function ProjectList() {
  const navigate = useNavigate()
  const { modal, message } = App.useApp()
  const { projects, isLoading, loadProjects, deleteProject } = useProjectStore()

  useEffect(() => {
    loadProjects()
  }, [loadProjects])

  const handleCreateNew = () => {
    navigate('/home')
  }

  const handleOpenProject = (project: Project) => {
    navigate(`/project/${project.id}/editor`)
  }

  const handleDeleteProject = (project: Project) => {
    modal.confirm({
      title: '确认删除',
      content: `确定要删除作品《${project.title}》吗？此操作不可恢复。`,
      okText: '删除',
      okType: 'danger',
      cancelText: '取消',
      onOk: async () => {
        await deleteProject(project.id)
        message.success('删除成功')
      }
    })
  }

  if (isLoading) {
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
          <h1 className="text-2xl font-bold text-dark-text mb-1">我的作品</h1>
          <p className="text-dark-muted">管理你的所有创作项目</p>
        </div>
        <Button
          type="primary"
          size="large"
          icon={<PlusOutlined />}
          onClick={handleCreateNew}
          className="gradient-button"
        >
          新建作品
        </Button>
      </div>

      {/* 项目列表 */}
      {projects.length === 0 ? (
        <div className="h-96 flex items-center justify-center">
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description={
              <span className="text-dark-muted">
                还没有任何作品，点击上方按钮开始创作
              </span>
            }
          >
            <Button type="primary" onClick={handleCreateNew}>
              开始创作
            </Button>
          </Empty>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {projects.map((project) => (
            <Card
              key={project.id}
              className="hover-card cursor-pointer"
              style={{ background: '#16213e', border: '1px solid #0f3460' }}
              bodyStyle={{ padding: 16 }}
              onClick={() => handleOpenProject(project)}
            >
              <div className="flex flex-col h-full">
                {/* 标题和操作 */}
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <BookOutlined className="text-primary-400 text-lg" />
                    <h3 className="text-lg font-medium text-dark-text truncate max-w-[180px]">
                      {project.title}
                    </h3>
                  </div>
                  <Dropdown
                    menu={{
                      items: [
                        {
                          key: 'edit',
                          icon: <EditOutlined />,
                          label: '编辑',
                          onClick: (e) => {
                            e.domEvent.stopPropagation()
                            handleOpenProject(project)
                          }
                        },
                        {
                          key: 'delete',
                          icon: <DeleteOutlined />,
                          label: '删除',
                          danger: true,
                          onClick: (e) => {
                            e.domEvent.stopPropagation()
                            handleDeleteProject(project)
                          }
                        }
                      ]
                    }}
                    trigger={['click']}
                    placement="bottomRight"
                  >
                    <Button
                      type="text"
                      size="small"
                      icon={<MoreOutlined />}
                      onClick={(e) => e.stopPropagation()}
                    />
                  </Dropdown>
                </div>

                {/* 灵感摘要 */}
                <p className="text-dark-muted text-sm mb-3 line-clamp-2 flex-1">
                  {project.inspiration || '暂无灵感描述'}
                </p>

                {/* 标签 */}
                <div className="flex flex-wrap gap-1 mb-3">
                  <Tag color="blue">{scaleLabels[project.scale] || '未知'}</Tag>
                  {project.genres.slice(0, 2).map((genre) => (
                    <Tag key={genre} color="cyan">
                      {genre}
                    </Tag>
                  ))}
                  {project.genres.length > 2 && (
                    <Tag>+{project.genres.length - 2}</Tag>
                  )}
                </div>

                {/* 时间信息 */}
                <div className="text-dark-muted text-xs">
                  更新于 {dayjs(project.updatedAt).fromNow()}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}

export default ProjectList
