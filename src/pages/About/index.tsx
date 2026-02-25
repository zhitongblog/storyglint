import { Card, Typography, Space, Button, Divider, Tag, message } from 'antd'
import {
  GithubOutlined,
  MailOutlined,
  HeartOutlined,
  InfoCircleOutlined,
  CopyOutlined
} from '@ant-design/icons'

// 导入本地微信收款码图片
import weipayImage from '../../../demo/weipay.jpg'

const { Title, Text, Paragraph, Link } = Typography

// 从 package.json 获取版本号
const APP_VERSION = '1.0.32'

function About() {
  const handleCopyEmail = () => {
    navigator.clipboard.writeText('lixd220@gmail.com')
    message.success('邮箱已复制到剪贴板')
  }

  const openExternal = (url: string) => {
    window.electron?.system?.openExternal(url)
  }

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <Card className="mb-6">
        <div className="text-center mb-6">
          <Title level={2} className="mb-2">
            <span className="bg-gradient-to-r from-purple-500 to-violet-600 bg-clip-text text-transparent">
              StoryGlint
            </span>
          </Title>
          <Text type="secondary" className="text-lg">智能网文创作工具</Text>
          <div className="mt-4">
            <Tag color="purple" className="text-base px-4 py-1">v{APP_VERSION}</Tag>
          </div>
        </div>

        <Divider />

        <Space direction="vertical" size="large" className="w-full">
          {/* 软件信息 */}
          <div>
            <Title level={4}>
              <InfoCircleOutlined className="mr-2" />
              软件信息
            </Title>
            <div className="grid grid-cols-2 gap-4 mt-4">
              <Card size="small" className="text-center">
                <Text type="secondary">当前版本</Text>
                <div className="mt-2">
                  <Tag color="purple">v{APP_VERSION}</Tag>
                </div>
              </Card>
              <Card size="small" className="text-center">
                <Text type="secondary">作者</Text>
                <div className="mt-2">
                  <Text strong>智通</Text>
                </div>
              </Card>
            </div>
          </div>

          {/* 联系方式 */}
          <div>
            <Title level={4}>
              <MailOutlined className="mr-2" />
              联系方式
            </Title>
            <div className="mt-4">
              <Space>
                <Text>联系邮箱：</Text>
                <Link onClick={() => openExternal('mailto:lixd220@gmail.com')}>
                  lixd220@gmail.com
                </Link>
                <Button
                  type="text"
                  size="small"
                  icon={<CopyOutlined />}
                  onClick={handleCopyEmail}
                />
              </Space>
            </div>
            <div className="mt-3">
              <Button
                icon={<GithubOutlined />}
                onClick={() => openExternal('https://github.com/zhitongblog/storyglint')}
              >
                GitHub 开源地址
              </Button>
            </div>
          </div>

          {/* 功能介绍 */}
          <div>
            <Title level={4}>主要功能</Title>
            <ul className="list-none p-0 mt-4 space-y-2">
              {[
                'AI 辅助创作 - 集成 Google Gemini，智能生成大纲和正文',
                '云端同步 - 作品自动备份到云端，多设备无缝切换',
                '角色管理 - 详细的角色档案，自动追踪角色状态',
                '章节管理 - 多卷多章节结构，自动统计字数',
                '角色死亡防控 - 自动检测并防止已故角色"复活"',
                '一键导出 - 支持导出为 TXT 文件，方便投稿',
                '深色模式 - 护眼的深色界面，沉浸式写作体验'
              ].map((feature, index) => (
                <li key={index} className="flex items-start gap-2">
                  <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-purple-500 text-white text-xs flex-shrink-0 mt-0.5">
                    ✓
                  </span>
                  <Text>{feature}</Text>
                </li>
              ))}
            </ul>
          </div>

          <Divider />

          {/* 捐赠支持 */}
          <div className="text-center">
            <Title level={4}>
              <HeartOutlined className="mr-2 text-red-500" />
              支持作者
            </Title>
            <Paragraph type="secondary" className="mt-4">
              StoryGlint 是一款免费开源的软件，如果它对您的创作有所帮助，
              <br />
              欢迎请作者喝杯咖啡，您的支持是我持续更新的动力！
            </Paragraph>

            {/* 使用独立的样式避免被 Ant Design 覆盖 */}
            <div
              style={{
                display: 'inline-block',
                padding: '16px',
                background: '#ffffff',
                borderRadius: '12px',
                boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
                marginTop: '24px'
              }}
            >
              <img
                src={weipayImage}
                alt="微信支付"
                style={{
                  display: 'block',
                  width: '280px',
                  height: '280px',
                  borderRadius: '8px',
                  objectFit: 'contain'
                }}
              />
              <div style={{
                marginTop: '12px',
                color: '#07c160',
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px'
              }}>
                <svg viewBox="0 0 24 24" fill="#07c160" width="20" height="20">
                  <path d="M8.691 2.188C3.891 2.188 0 5.476 0 9.53c0 2.212 1.17 4.203 3.002 5.55a.59.59 0 0 1 .213.665l-.39 1.48c-.019.07-.048.141-.048.213 0 .163.13.295.29.295a.326.326 0 0 0 .167-.054l1.903-1.114a.864.864 0 0 1 .717-.098 10.16 10.16 0 0 0 2.837.403c.276 0 .543-.027.811-.05-.857-2.578.157-4.972 1.932-6.446 1.703-1.415 3.882-1.98 5.853-1.838-.576-3.583-4.196-6.348-8.596-6.348zM5.785 5.991c.642 0 1.162.529 1.162 1.18a1.17 1.17 0 0 1-1.162 1.178A1.17 1.17 0 0 1 4.623 7.17c0-.651.52-1.18 1.162-1.18zm5.813 0c.642 0 1.162.529 1.162 1.18a1.17 1.17 0 0 1-1.162 1.178 1.17 1.17 0 0 1-1.162-1.178c0-.651.52-1.18 1.162-1.18z"/>
                </svg>
                微信扫码支持
              </div>
            </div>

            <div className="mt-6 p-4 bg-yellow-50 rounded-lg text-yellow-700 max-w-md mx-auto">
              感谢每一位支持者！您的鼓励让 StoryGlint 变得更好。
            </div>
          </div>
        </Space>
      </Card>

      <div className="text-center text-gray-500 text-sm">
        &copy; 2026 StoryGlint. All rights reserved.
      </div>
    </div>
  )
}

export default About
