import { shell } from 'electron'
import Store from 'electron-store'
import http from 'http'
import url from 'url'

const store = new Store({
  name: 'storyglint-settings'
})

// 本地回调服务器端口
const CALLBACK_PORT = 8766
const CALLBACK_URL = `http://127.0.0.1:${CALLBACK_PORT}/callback`

export interface AuthTokens {
  accessToken: string
  refreshToken: string
  expiresIn: number
  expiresAt: number
}

export interface ServerUser {
  id: string
  googleId?: string
  email: string
  name?: string
  picture?: string
  status: 'pending' | 'approved' | 'rejected' | 'suspended'
  role: 'user' | 'admin'
  createdAt: string
  lastLoginAt?: string
}

/**
 * 服务端认证服务
 * 处理与 StoryGlint 服务端的 OAuth 认证
 */
export class ServerAuthService {
  private serverUrl: string
  private callbackServer: http.Server | null = null

  constructor(serverUrl?: string) {
    // 从配置读取服务端地址，或使用默认值
    let url = serverUrl || (store.get('serverUrl') as string) || 'https://storyglint.com'
    // 将 localhost 替换为 127.0.0.1 避免 IPv6 问题
    url = url.replace('://localhost:', '://127.0.0.1:')
    this.serverUrl = url
  }

  /**
   * 设置服务端URL
   */
  setServerUrl(url: string): void {
    // 将 localhost 替换为 127.0.0.1 避免 IPv6 问题
    const normalizedUrl = url.replace('://localhost:', '://127.0.0.1:')
    this.serverUrl = normalizedUrl
    store.set('serverUrl', normalizedUrl)
  }

  /**
   * 获取服务端URL
   */
  getServerUrl(): string {
    return this.serverUrl
  }

  /**
   * 启动 OAuth 登录流程
   */
  async login(): Promise<{
    success: boolean
    user?: ServerUser
    tokens?: AuthTokens
    error?: string
  }> {
    try {
      console.log('[ServerAuth] 开始登录流程，服务端:', this.serverUrl)

      // 使用系统浏览器进行认证
      return await this.loginViaSystemBrowser()
    } catch (error: any) {
      console.error('[ServerAuth] 登录失败:', error)
      return {
        success: false,
        error: error.message || '登录失败'
      }
    }
  }

  /**
   * 使用系统浏览器进行登录
   */
  private loginViaSystemBrowser(): Promise<{
    success: boolean
    user?: ServerUser
    tokens?: AuthTokens
    error?: string
  }> {
    return new Promise((resolve) => {
      console.log('[ServerAuth] 准备启动回调服务器...')

      // 关闭之前的服务器（如果有）
      if (this.callbackServer) {
        console.log('[ServerAuth] 关闭旧的回调服务器')
        try {
          this.callbackServer.close()
        } catch (e) {
          console.warn('[ServerAuth] 关闭旧服务器失败:', e)
        }
        this.callbackServer = null
      }

      let resolved = false
      const resolveOnce = (value: {
        success: boolean
        user?: ServerUser
        tokens?: AuthTokens
        error?: string
      }) => {
        if (!resolved) {
          resolved = true
          // 关闭服务器
          if (this.callbackServer) {
            this.callbackServer.close()
            this.callbackServer = null
          }
          resolve(value)
        }
      }

      // 创建本地 HTTP 服务器来接收回调
      this.callbackServer = http.createServer(async (req, res) => {
        console.log('[ServerAuth] ========== 收到HTTP请求 ==========')
        console.log('[ServerAuth] 方法:', req.method)
        console.log('[ServerAuth] 完整URL:', req.url)
        console.log('[ServerAuth] Headers:', JSON.stringify(req.headers, null, 2))

        const parsedUrl = url.parse(req.url || '', true)
        console.log('[ServerAuth] 解析后路径:', parsedUrl.pathname)
        console.log('[ServerAuth] Query参数:', JSON.stringify(parsedUrl.query, null, 2))

        // 处理 favicon.ico 请求
        if (parsedUrl.pathname === '/favicon.ico') {
          res.writeHead(204)
          res.end()
          return
        }

        // 处理根路径（用于调试）
        if (parsedUrl.pathname === '/') {
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
          res.end('<html><body><h1>StoryGlint OAuth Callback Server</h1><p>等待回调中...</p></body></html>')
          return
        }

        if (parsedUrl.pathname === '/callback') {
          const query = parsedUrl.query

          // 发送成功页面
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
          res.end(`
            <!DOCTYPE html>
            <html>
            <head>
              <meta charset="utf-8">
              <title>登录成功</title>
              <style>
                body {
                  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                  display: flex;
                  justify-content: center;
                  align-items: center;
                  height: 100vh;
                  margin: 0;
                  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                  color: white;
                }
                .container {
                  text-align: center;
                  padding: 40px;
                  background: rgba(255,255,255,0.1);
                  border-radius: 16px;
                  backdrop-filter: blur(10px);
                }
                h1 { margin-bottom: 10px; }
                p { opacity: 0.9; }
              </style>
            </head>
            <body>
              <div class="container">
                <h1>${query.error ? '登录失败' : '登录成功'}</h1>
                <p>${query.error ? '请关闭此窗口并重试' : '请关闭此窗口返回应用'}</p>
              </div>
            </body>
            </html>
          `)

          // 处理回调参数
          if (query.error) {
            console.error('[ServerAuth] 认证失败:', query.error)
            let errorMessage = '认证失败'
            if (query.error === 'auth_failed') {
              errorMessage = '认证失败，请重试'
            } else if (query.error === 'rejected') {
              errorMessage = '您的账号申请已被拒绝'
            } else if (query.error === 'suspended') {
              errorMessage = '您的账号已被暂停'
            } else if (query.error === 'server_error') {
              errorMessage = '服务器错误，请稍后重试'
            }
            resolveOnce({ success: false, error: errorMessage })
          } else if (query.access_token || query.accessToken) {
            const accessToken = (query.access_token || query.accessToken) as string
            const refreshToken = (query.refresh_token || query.refreshToken) as string
            const expiresIn = parseInt((query.expires_in || query.expiresIn || '3600') as string, 10)
            const status = query.status as string

            console.log('[ServerAuth] 成功获取令牌, 状态:', status)

            if (!accessToken || !refreshToken) {
              resolveOnce({ success: false, error: '缺少认证令牌' })
              return
            }

            // 保存令牌
            const tokens: AuthTokens = {
              accessToken,
              refreshToken,
              expiresIn,
              expiresAt: Date.now() + expiresIn * 1000
            }

            this.saveTokens(tokens)

            // 获取用户信息
            try {
              const user = await this.fetchUserInfo(accessToken)

              if (user) {
                console.log('[ServerAuth] 登录成功:', user.email, '状态:', user.status)
                this.saveUser(user)
                resolveOnce({ success: true, user, tokens })
              } else {
                resolveOnce({ success: false, error: '无法获取用户信息' })
              }
            } catch (error: any) {
              console.error('[ServerAuth] 获取用户信息失败:', error)
              resolveOnce({ success: false, error: error.message })
            }
          } else {
            resolveOnce({ success: false, error: '未收到认证信息' })
          }
        } else {
          // 未知路径
          console.log('[ServerAuth] 未知路径:', parsedUrl.pathname)
          res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
          res.end('Not Found')
        }
      })

      // 启动服务器
      this.callbackServer.listen(CALLBACK_PORT, '127.0.0.1', () => {
        console.log('[ServerAuth] 回调服务器已启动:', CALLBACK_URL)
        console.log('[ServerAuth] 服务器监听地址: 127.0.0.1:' + CALLBACK_PORT)

        // 构建 OAuth URL（带上回调地址参数）
        const authUrl = `${this.serverUrl}/api/auth/google?redirect_uri=${encodeURIComponent(CALLBACK_URL)}`
        console.log('[ServerAuth] 打开系统浏览器:', authUrl)

        // 使用系统默认浏览器打开
        shell.openExternal(authUrl)
      })

      // 监听连接事件
      this.callbackServer.on('connection', (socket) => {
        console.log('[ServerAuth] 新连接:', socket.remoteAddress)
      })

      this.callbackServer.on('error', (error: NodeJS.ErrnoException) => {
        console.error('[ServerAuth] 服务器错误:', error)
        if (error.code === 'EADDRINUSE') {
          resolveOnce({ success: false, error: `端口 ${CALLBACK_PORT} 已被占用` })
        } else {
          resolveOnce({ success: false, error: error.message })
        }
      })

      // 设置超时（5分钟）
      setTimeout(() => {
        resolveOnce({ success: false, error: '登录超时，请重试' })
      }, 5 * 60 * 1000)
    })
  }

  /**
   * 获取用户信息
   */
  private async fetchUserInfo(accessToken: string): Promise<ServerUser | null> {
    try {
      console.log('[ServerAuth] 获取用户信息, URL:', `${this.serverUrl}/api/auth/me`)
      const response = await fetch(`${this.serverUrl}/api/auth/me`, {
        headers: {
          Authorization: `Bearer ${accessToken}`
        }
      })

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }

      const data = await response.json()
      console.log('[ServerAuth] 用户信息响应:', data)

      // 服务端返回格式: { success: true, data: { id, email, ... } }
      if (data.success && data.data) {
        return data.data as ServerUser
      }

      return null
    } catch (error) {
      console.error('[ServerAuth] 获取用户信息失败:', error)
      return null
    }
  }

  /**
   * 刷新访问令牌
   */
  async refreshAccessToken(): Promise<{ success: boolean; tokens?: AuthTokens; error?: string }> {
    try {
      const tokens = this.getTokens()
      if (!tokens?.refreshToken) {
        return {
          success: false,
          error: '没有刷新令牌'
        }
      }

      console.log('[ServerAuth] 刷新访问令牌...')

      const response = await fetch(`${this.serverUrl}/api/auth/refresh`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          refreshToken: tokens.refreshToken
        })
      })

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }

      const data = await response.json()

      if (data.success && data.data?.accessToken) {
        const newTokens: AuthTokens = {
          accessToken: data.data.accessToken,
          refreshToken: tokens.refreshToken,
          expiresIn: data.data.expiresIn || 3600,
          expiresAt: Date.now() + (data.data.expiresIn || 3600) * 1000
        }

        this.saveTokens(newTokens)

        console.log('[ServerAuth] 令牌刷新成功')

        return {
          success: true,
          tokens: newTokens
        }
      }

      return {
        success: false,
        error: '刷新失败'
      }
    } catch (error: any) {
      console.error('[ServerAuth] 刷新令牌失败:', error)
      return {
        success: false,
        error: error.message
      }
    }
  }

  /**
   * 登出
   */
  async logout(): Promise<void> {
    try {
      const tokens = this.getTokens()
      if (tokens?.accessToken) {
        // 通知服务端登出
        await fetch(`${this.serverUrl}/api/auth/logout`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${tokens.accessToken}`
          }
        })
      }
    } catch (error) {
      console.error('[ServerAuth] 登出请求失败:', error)
    } finally {
      // 清除本地存储
      this.clearTokens()
      this.clearUser()
      console.log('[ServerAuth] 已登出')
    }
  }

  /**
   * 检查是否已登录
   */
  isLoggedIn(): boolean {
    const tokens = this.getTokens()
    const user = this.getUser()
    return !!(tokens?.accessToken && user)
  }

  /**
   * 获取当前用户
   */
  getUser(): ServerUser | null {
    const userData = store.get('serverUser')
    return userData ? (userData as ServerUser) : null
  }

  /**
   * 获取访问令牌
   */
  getAccessToken(): string | null {
    const tokens = this.getTokens()
    return tokens?.accessToken || null
  }

  /**
   * 获取所有令牌
   */
  getTokens(): AuthTokens | null {
    const tokensData = store.get('serverTokens')
    return tokensData ? (tokensData as AuthTokens) : null
  }

  /**
   * 保存令牌
   */
  private saveTokens(tokens: AuthTokens): void {
    store.set('serverTokens', tokens)
  }

  /**
   * 保存用户信息
   */
  private saveUser(user: ServerUser): void {
    store.set('serverUser', user)
  }

  /**
   * 清除令牌
   */
  private clearTokens(): void {
    store.delete('serverTokens')
  }

  /**
   * 清除用户信息
   */
  private clearUser(): void {
    store.delete('serverUser')
  }

  /**
   * 检查用户状态（从服务器获取最新状态）
   */
  async checkUserStatus(): Promise<{
    isApproved: boolean
    status: string
    message?: string
  }> {
    const tokens = this.getTokens()

    if (!tokens?.accessToken) {
      return {
        isApproved: false,
        status: 'not_logged_in',
        message: '未登录'
      }
    }

    try {
      // 从服务器获取最新的用户信息
      console.log('[ServerAuth] 从服务器获取最新用户状态...')
      const user = await this.fetchUserInfo(tokens.accessToken)

      if (user) {
        // 更新本地存储的用户信息
        this.saveUser(user)
        console.log('[ServerAuth] 用户状态已更新:', user.status)

        switch (user.status) {
          case 'approved':
            return {
              isApproved: true,
              status: 'approved'
            }
          case 'pending':
            return {
              isApproved: false,
              status: 'pending',
              message: '您的账号正在等待管理员审批'
            }
          case 'rejected':
            return {
              isApproved: false,
              status: 'rejected',
              message: '您的账号申请已被拒绝'
            }
          case 'suspended':
            return {
              isApproved: false,
              status: 'suspended',
              message: '您的账号已被暂停'
            }
          default:
            return {
              isApproved: false,
              status: 'unknown',
              message: '未知状态'
            }
        }
      } else {
        // 如果无法获取用户信息，可能是 token 过期，尝试刷新
        console.log('[ServerAuth] 无法获取用户信息，尝试刷新令牌...')
        const refreshResult = await this.refreshAccessToken()

        if (refreshResult.success && refreshResult.tokens) {
          // 使用新 token 再次获取用户信息
          const refreshedUser = await this.fetchUserInfo(refreshResult.tokens.accessToken)
          if (refreshedUser) {
            this.saveUser(refreshedUser)
            return {
              isApproved: refreshedUser.status === 'approved',
              status: refreshedUser.status,
              message: refreshedUser.status === 'pending' ? '您的账号正在等待管理员审批' : undefined
            }
          }
        }

        return {
          isApproved: false,
          status: 'error',
          message: '无法获取用户状态，请重新登录'
        }
      }
    } catch (error: any) {
      console.error('[ServerAuth] 检查用户状态失败:', error)

      // 如果网络错误，返回本地存储的状态
      const localUser = this.getUser()
      if (localUser) {
        return {
          isApproved: localUser.status === 'approved',
          status: localUser.status,
          message: `无法连接服务器，显示本地缓存状态: ${localUser.status}`
        }
      }

      return {
        isApproved: false,
        status: 'error',
        message: error.message || '检查状态失败'
      }
    }
  }

  /**
   * 获取本地存储的用户状态（不请求服务器）
   */
  getLocalUserStatus(): {
    isApproved: boolean
    status: string
    message?: string
  } {
    const user = this.getUser()

    if (!user) {
      return {
        isApproved: false,
        status: 'not_logged_in',
        message: '未登录'
      }
    }

    switch (user.status) {
      case 'approved':
        return {
          isApproved: true,
          status: 'approved'
        }
      case 'pending':
        return {
          isApproved: false,
          status: 'pending',
          message: '您的账号正在等待管理员审批'
        }
      case 'rejected':
        return {
          isApproved: false,
          status: 'rejected',
          message: '您的账号申请已被拒绝'
        }
      case 'suspended':
        return {
          isApproved: false,
          status: 'suspended',
          message: '您的账号已被暂停'
        }
      default:
        return {
          isApproved: false,
          status: 'unknown',
          message: '未知状态'
        }
    }
  }
}
