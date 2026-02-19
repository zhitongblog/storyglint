import { useState, useEffect } from 'react'
import { Outlet, useLocation, useNavigate, useParams } from 'react-router-dom'
import { Layout as AntLayout, Menu, Avatar, Dropdown, Button, Space, Tooltip, App } from 'antd'
import {
  HomeOutlined,
  EditOutlined,
  OrderedListOutlined,
  TeamOutlined,
  FolderOutlined,
  SettingOutlined,
  PictureOutlined,
  CloudSyncOutlined,
  UserOutlined,
  LogoutOutlined,
  LoginOutlined,
  AppstoreOutlined,
  CrownOutlined,
  InfoCircleOutlined
} from '@ant-design/icons'
import { useProjectStore } from '../../stores/project'
import type { MenuProps } from 'antd'
import type { ServerUser } from '../../types'

const { Sider, Content, Header } = AntLayout

function Layout() {
  const location = useLocation()
  const navigate = useNavigate()
  const { projectId } = useParams()
  const { modal, message } = App.useApp()
  const { currentProject, isGenerating, setGenerating } = useProjectStore()
  const [serverUser, setServerUser] = useState<ServerUser | null>(null)
  const [isServerLoggedIn, setIsServerLoggedIn] = useState(false)

  // 检查服务端用户状态
  useEffect(() => {
    const checkServerUser = async () => {
      try {
        if (window.electron?.serverAuth) {
          const loggedIn = await window.electron.serverAuth.isLoggedIn()
          setIsServerLoggedIn(loggedIn)
          if (loggedIn) {
            const user = await window.electron.serverAuth.getUser()
            setServerUser(user)
          } else {
            setServerUser(null)
          }
        }
      } catch (error) {
        console.error('Failed to check server user:', error)
        setServerUser(null)
        setIsServerLoggedIn(false)
      }
    }
    checkServerUser()
  }, [])

  // 项目相关菜单
  const projectMenuItems: MenuProps['items'] = projectId
    ? [
        {
          key: `/project/${projectId}/editor`,
          icon: <EditOutlined />,
          label: '正文编辑'
        },
        {
          key: `/project/${projectId}/outline`,
          icon: <OrderedListOutlined />,
          label: '大纲管理'
        },
        {
          key: `/project/${projectId}/characters`,
          icon: <TeamOutlined />,
          label: '角色核心'
        },
        {
          key: `/project/${projectId}/archive`,
          icon: <FolderOutlined />,
          label: '全书档案'
        },
        {
          key: `/project/${projectId}/settings`,
          icon: <SettingOutlined />,
          label: '世界观设定'
        },
        {
          key: `/project/${projectId}/cover`,
          icon: <PictureOutlined />,
          label: '封面生成'
        }
      ]
    : []

  // 主菜单
  const mainMenuItems: MenuProps['items'] = [
    {
      key: '/projects',
      icon: <AppstoreOutlined />,
      label: '作品列表'
    },
    {
      key: '/home',
      icon: <HomeOutlined />,
      label: '新建灵感'
    },
    {
      type: 'divider'
    },
    {
      key: '/settings',
      icon: <SettingOutlined />,
      label: '全局设置'
    },
    {
      key: '/about',
      icon: <InfoCircleOutlined />,
      label: '关于'
    },
    // 仅管理员显示管理后台入口
    ...(serverUser?.role === 'admin'
      ? [
          {
            key: '/admin',
            icon: <CrownOutlined />,
            label: '管理后台'
          }
        ]
      : [])
  ]

  const handleMenuClick: MenuProps['onClick'] = ({ key }) => {
    // 导航守卫：生成过程中阻止页面切换
    if (isGenerating) {
      modal.confirm({
        title: '正在生成中',
        content: '章节大纲正在生成中，离开页面将停止生成。确定要离开吗？',
        okText: '停止生成并离开',
        okType: 'danger',
        cancelText: '继续生成',
        onOk: () => {
          // 停止生成状态
          setGenerating(false)
          navigate(key)
        }
      })
      return
    }
    navigate(key)
  }

  // 用户下拉菜单
  const userMenuItems: MenuProps['items'] = isServerLoggedIn && serverUser
    ? [
        {
          key: 'profile',
          icon: <UserOutlined />,
          label: serverUser?.name || serverUser?.email || '用户'
        },
        ...(serverUser?.status === 'approved'
          ? [
              {
                key: 'sync',
                icon: <CloudSyncOutlined />,
                label: '同步到云端'
              },
              {
                key: 'restore',
                icon: <CloudSyncOutlined />,
                label: '从云端恢复'
              }
            ]
          : []),
        {
          type: 'divider' as const
        },
        {
          key: 'logout',
          icon: <LogoutOutlined />,
          label: '退出登录',
          danger: true
        }
      ]
    : []

  const handleUserMenuClick: MenuProps['onClick'] = async ({ key }) => {
    if (key === 'logout') {
      await window.electron.serverAuth.logout()
      setServerUser(null)
      setIsServerLoggedIn(false)
      message.success('已退出登录')
    } else if (key === 'sync') {
      console.log('[Frontend] 开始同步操作...')
      message.loading('正在同步到云端...', 0)
      try {
        const result = await window.electron.serverSync.sync()
        console.log('[Frontend] 同步结果:', result)
        message.destroy()
        if (result.success) {
          message.success(`同步完成！上传 ${result.uploaded || 0} 个，下载 ${result.downloaded || 0} 个`)
        } else {
          // 构建详细的错误信息
          let errorMsg = result.error || '未知错误'
          if (result.errors && result.errors.length > 0) {
            errorMsg = result.errors.join('；')
          }
          message.error(`同步失败：${errorMsg}`, 5)
        }
      } catch (error: any) {
        message.destroy()
        console.error('[Frontend] 同步异常:', error)
        message.error(`同步失败：${error.message || '网络错误'}`, 5)
      }
    } else if (key === 'restore') {
      message.loading('正在从云端恢复数据...', 0)
      try {
        const result = await window.electron.serverSync.restore()
        message.destroy()
        if (result.success) {
          message.success(`成功恢复 ${result.importedCount || 0} 个项目`)
          window.location.reload()
        } else {
          message.error(result.error || '恢复失败')
        }
      } catch (error: any) {
        message.destroy()
        message.error(error.message || '恢复失败')
      }
    }
  }

  const selectedKeys = [location.pathname]

  return (
    <AntLayout className="h-screen">
      {/* 标题栏 */}
      <Header
        className="titlebar-drag flex items-center justify-between px-4"
        style={{
          height: 40,
          background: 'var(--color-bg-tertiary)',
          borderBottom: '1px solid var(--color-border)',
          padding: '0 16px'
        }}
      >
        <div className="flex items-center gap-2">
          <span className="text-primary-400 font-bold text-lg">NovaScribe</span>
          {currentProject && (
            <>
              <span className="text-dark-muted">/</span>
              <span className="text-dark-text">{currentProject.title}</span>
            </>
          )}
        </div>

        <div className="titlebar-no-drag flex items-center gap-2">
          {isServerLoggedIn && serverUser ? (
            <Dropdown
              menu={{ items: userMenuItems, onClick: handleUserMenuClick }}
              placement="bottomRight"
            >
              <Space className="cursor-pointer">
                <Avatar size="small" src={serverUser?.picture} icon={<UserOutlined />} />
                <span className="text-dark-text text-sm">{serverUser?.name || serverUser?.email}</span>
              </Space>
            </Dropdown>
          ) : (
            <Button
              type="primary"
              size="small"
              icon={<LoginOutlined />}
              onClick={() => navigate('/settings')}
            >
              登录
            </Button>
          )}
        </div>
      </Header>

      <AntLayout>
        {/* 侧边栏 */}
        <Sider
          width={200}
          style={{
            background: 'var(--color-bg-secondary)',
            borderRight: '1px solid var(--color-border)'
          }}
        >
          <div className="flex flex-col h-full">
            {/* 主菜单 */}
            <Menu
              mode="inline"
              selectedKeys={selectedKeys}
              onClick={handleMenuClick}
              items={mainMenuItems}
              className="sidebar-menu border-none"
              style={{ background: 'transparent' }}
            />

            {/* 项目菜单 */}
            {projectId && projectMenuItems.length > 0 && (
              <>
                <div className="px-4 py-2 mt-4">
                  <span className="text-dark-muted text-xs uppercase tracking-wider">
                    当前作品
                  </span>
                </div>
                <Menu
                  mode="inline"
                  selectedKeys={selectedKeys}
                  onClick={handleMenuClick}
                  items={projectMenuItems}
                  className="sidebar-menu border-none flex-1"
                  style={{ background: 'transparent' }}
                />
              </>
            )}

            {/* 底部同步状态 */}
            <div className="p-4 border-t border-dark-border">
              <Tooltip title={isServerLoggedIn && serverUser?.status === 'approved' ? '点击同步到云端' : '请先登录并等待管理员审批'}>
                <Button
                  type="text"
                  icon={<CloudSyncOutlined />}
                  className="w-full text-left"
                  onClick={async () => {
                    if (!isServerLoggedIn) {
                      message.info('请先在全局设置中登录')
                      navigate('/settings')
                      return
                    }
                    if (serverUser?.status !== 'approved') {
                      message.info('您的账户正在等待管理员审批')
                      return
                    }
                    console.log('[Frontend] 侧边栏同步按钮被点击')
                    message.loading('正在同步...', 0)
                    try {
                      const result = await window.electron.serverSync.sync()
                      console.log('[Frontend] 同步结果:', result)
                      message.destroy()
                      if (result.success) {
                        message.success(`同步完成！上传 ${result.uploaded || 0} 个，下载 ${result.downloaded || 0} 个`)
                      } else {
                        // 构建详细的错误信息
                        let errorMsg = result.error || '未知错误'
                        if (result.errors && result.errors.length > 0) {
                          errorMsg = result.errors.join('；')
                        }
                        message.error(`同步失败：${errorMsg}`, 5)
                      }
                    } catch (error: any) {
                      message.destroy()
                      console.error('[Frontend] 同步异常:', error)
                      message.error(`同步失败：${error.message || '网络错误'}`, 5)
                    }
                  }}
                >
                  <span className="text-dark-muted text-sm">云同步</span>
                </Button>
              </Tooltip>
            </div>
          </div>
        </Sider>

        {/* 主内容区 */}
        <Content
          style={{
            background: 'var(--color-bg-primary)',
            overflow: 'auto'
          }}
        >
          <Outlet />
        </Content>
      </AntLayout>
    </AntLayout>
  )
}

export default Layout
