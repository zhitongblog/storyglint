import { BrowserWindow, safeStorage, shell } from 'electron'
import Store from 'electron-store'
import { google } from 'googleapis'
import http from 'http'
import url from 'url'
import { HttpsProxyAgent } from 'https-proxy-agent'

const REDIRECT_URI = 'http://127.0.0.1:8765/callback'

const SCOPES = [
  'https://www.googleapis.com/auth/userinfo.profile',
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/drive.file'
]

interface TokenData {
  access_token: string
  refresh_token: string
  expiry_date: number
}

interface UserInfo {
  id: string
  email: string
  name: string
  picture: string
}

export class GoogleAuthService {
  private store: Store
  private settingsStore: Store
  private oauth2Client: any = null
  private callbackServer: http.Server | null = null
  private proxyAgent: HttpsProxyAgent<string> | null = null

  constructor() {
    // 注意：配置文件迁移已在 main.ts 中处理
    this.store = new Store({
      name: 'storyglint-auth',
      encryptionKey: 'storyglint-secure-key'
    })

    this.settingsStore = new Store({
      name: 'storyglint-settings'
    })

    this.setupProxy()
    this.initOAuth2Client()
  }

  /**
   * 验证 URL 是否有效
   */
  private isValidUrl(urlString: string): boolean {
    try {
      new URL(urlString)
      return true
    } catch {
      return false
    }
  }

  /**
   * 配置代理
   */
  private setupProxy() {
    const proxyEnabled = this.settingsStore.get('proxyEnabled', false) as boolean
    const proxyUrl = this.settingsStore.get('proxyUrl', '') as string

    console.log('[GoogleAuth] 代理配置 - 启用:', proxyEnabled, '地址:', proxyUrl || '(系统代理)')

    if (proxyEnabled) {
      try {
        if (proxyUrl && this.isValidUrl(proxyUrl)) {
          // 使用手动配置的代理
          console.log('[GoogleAuth] 配置手动代理:', proxyUrl)
          this.proxyAgent = new HttpsProxyAgent(proxyUrl)

          // 设置环境变量（作为备用）
          process.env.HTTP_PROXY = proxyUrl
          process.env.HTTPS_PROXY = proxyUrl
        } else if (proxyUrl) {
          // 代理 URL 无效
          console.warn('[GoogleAuth] 代理 URL 无效:', proxyUrl)
        } else {
          // 使用系统代理
          console.log('[GoogleAuth] 尝试使用系统代理')
          // 检查系统环境变量
          const systemProxy = process.env.HTTP_PROXY || process.env.HTTPS_PROXY ||
                             process.env.http_proxy || process.env.https_proxy
          if (systemProxy && this.isValidUrl(systemProxy)) {
            console.log('[GoogleAuth] 发现系统代理:', systemProxy)
            this.proxyAgent = new HttpsProxyAgent(systemProxy)
          } else if (systemProxy) {
            console.warn('[GoogleAuth] 系统代理 URL 无效:', systemProxy)
          } else {
            console.log('[GoogleAuth] 未发现系统代理环境变量')
          }
        }
      } catch (error) {
        console.error('[GoogleAuth] 配置代理失败:', error)
        this.proxyAgent = null
      }
    } else {
      console.log('[GoogleAuth] 代理未启用')
      // 清除环境变量
      delete process.env.HTTP_PROXY
      delete process.env.HTTPS_PROXY
      delete process.env.http_proxy
      delete process.env.https_proxy
    }
  }

  /**
   * 初始化或重新初始化 OAuth2 客户端
   */
  private initOAuth2Client() {
    const clientId = this.settingsStore.get('googleClientId') as string
    const clientSecret = this.settingsStore.get('googleClientSecret') as string

    if (clientId && clientSecret) {
      // 配置全局代理（如果有）
      if (this.proxyAgent) {
        console.log('[GoogleAuth] 为 googleapis 配置代理')
        // 设置全局 HTTP 代理配置
        google.options({
          http2: false // 禁用 HTTP/2，某些代理不支持
        })
      }

      this.oauth2Client = new google.auth.OAuth2(
        clientId,
        clientSecret,
        REDIRECT_URI
      )
    } else {
      this.oauth2Client = null
    }
  }

  /**
   * 检查 OAuth 是否已配置
   */
  isConfigured(): boolean {
    const clientId = this.settingsStore.get('googleClientId') as string
    const clientSecret = this.settingsStore.get('googleClientSecret') as string
    return !!(clientId && clientSecret)
  }

  /**
   * 开始 OAuth 登录流程
   */
  async login(): Promise<{ success: boolean; user?: UserInfo; error?: string }> {
    console.log('[GoogleAuth] 开始登录流程...')

    // 重新初始化以获取最新配置
    this.initOAuth2Client()

    if (!this.oauth2Client) {
      console.error('[GoogleAuth] OAuth2 客户端未配置')
      return {
        success: false,
        error: '请先在全局设置中配置 Google OAuth Client ID 和 Client Secret'
      }
    }

    console.log('[GoogleAuth] OAuth2 客户端已初始化')

    try {
      console.log('[GoogleAuth] 等待用户授权...')
      const code = await this.getAuthCodeViaSystemBrowser()

      if (!code) {
        console.log('[GoogleAuth] 用户取消或超时')
        return { success: false, error: '用户取消了登录或授权超时' }
      }

      console.log('[GoogleAuth] 获得授权码，正在交换 token...')

      // 获取 token
      const { tokens } = await this.oauth2Client.getToken(code)
      console.log('[GoogleAuth] Token 获取成功')

      this.oauth2Client.setCredentials(tokens)

      // 保存 token
      console.log('[GoogleAuth] 保存 token...')
      await this.saveTokens(tokens)
      console.log('[GoogleAuth] Token 已保存')

      // 获取用户信息
      console.log('[GoogleAuth] 获取用户信息...')
      const user = await this.fetchUserInfo()

      if (user) {
        console.log('[GoogleAuth] 用户信息获取成功:', user.email)
        await this.saveUser(user)
        console.log('[GoogleAuth] 用户信息已保存')
      } else {
        console.warn('[GoogleAuth] 用户信息获取失败')
      }

      console.log('[GoogleAuth] 登录成功！')
      return { success: true, user: user || undefined }
    } catch (error: any) {
      console.error('[GoogleAuth] 登录失败:', error)
      console.error('[GoogleAuth] 错误详情:', error.response?.data || error.message)
      return { success: false, error: error.message || '登录失败' }
    }
  }

  /**
   * 使用系统默认浏览器获取授权码
   */
  private getAuthCodeViaSystemBrowser(): Promise<string | null> {
    return new Promise((resolve) => {
      console.log('[GoogleAuth] 准备启动回调服务器...')

      // 关闭之前的服务器（如果有）
      if (this.callbackServer) {
        console.log('[GoogleAuth] 关闭旧的回调服务器')
        try {
          this.callbackServer.close()
        } catch (e) {
          console.warn('[GoogleAuth] 关闭旧服务器失败:', e)
        }
        this.callbackServer = null
      }

      let resolved = false
      const resolveOnce = (value: string | null) => {
        if (!resolved) {
          resolved = true
          console.log('[GoogleAuth] 回调处理完成，结果:', value ? '成功' : '失败')
          resolve(value)
        }
      }

      // 创建本地 HTTP 服务器来接收回调
      this.callbackServer = http.createServer((req, res) => {
        const parsedUrl = url.parse(req.url || '', true)
        console.log('[GoogleAuth] 收到回调请求:', parsedUrl.pathname)

        if (parsedUrl.pathname === '/callback') {
          const code = parsedUrl.query.code as string
          const error = parsedUrl.query.error as string

          console.log('[GoogleAuth] 回调参数 - code:', code ? '存在' : '无', 'error:', error || '无')

          // 返回成功页面
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
          res.end(`
            <!DOCTYPE html>
            <html>
            <head>
              <title>${error ? '登录失败' : '登录成功'}</title>
              <meta charset="utf-8">
              <style>
                body {
                  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Microsoft YaHei', sans-serif;
                  display: flex;
                  justify-content: center;
                  align-items: center;
                  height: 100vh;
                  margin: 0;
                  background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
                  color: #e8e8e8;
                }
                .container {
                  text-align: center;
                  padding: 40px;
                  background: rgba(255,255,255,0.1);
                  border-radius: 16px;
                }
                h1 { color: ${error ? '#ff6b6b' : '#0ea5e9'}; margin-bottom: 16px; }
                p { color: #a0a0a0; }
              </style>
            </head>
            <body>
              <div class="container">
                <h1>${error ? '登录失败' : '登录成功！'}</h1>
                <p>${error ? '错误: ' + error + '<br>请关闭此页面并重试' : '请返回 StoryGlint 应用，此页面可以关闭了'}</p>
              </div>
            </body>
            </html>
          `)

          // 先 resolve，再关闭服务器
          if (error) {
            console.error('[GoogleAuth] OAuth 错误:', error)
            resolveOnce(null)
          } else if (code) {
            console.log('[GoogleAuth] 获得授权码')
            resolveOnce(code)
          } else {
            console.error('[GoogleAuth] 回调参数不完整')
            resolveOnce(null)
          }

          // 延迟关闭服务器，确保响应已发送
          setTimeout(() => {
            if (this.callbackServer) {
              console.log('[GoogleAuth] 关闭回调服务器')
              try {
                this.callbackServer.close()
              } catch (e) {
                console.warn('[GoogleAuth] 关闭服务器失败:', e)
              }
              this.callbackServer = null
            }
          }, 1000)
        } else {
          res.writeHead(404)
          res.end('Not Found')
        }
      })

      this.callbackServer.on('error', (err: any) => {
        console.error('[GoogleAuth] 回调服务器错误:', err)
        if (err.code === 'EADDRINUSE') {
          console.error('[GoogleAuth] 端口 8765 被占用')
        }
        resolveOnce(null)
      })

      this.callbackServer.listen(8765, '127.0.0.1', () => {
        console.log('[GoogleAuth] 回调服务器已启动，监听端口 8765')

        try {
          // 生成授权 URL
          const authUrl = this.oauth2Client.generateAuthUrl({
            access_type: 'offline',
            scope: SCOPES,
            prompt: 'consent'
          })

          console.log('[GoogleAuth] 授权 URL:', authUrl)

          // 使用系统默认浏览器打开登录页面
          shell.openExternal(authUrl)
          console.log('[GoogleAuth] 已在默认浏览器中打开授权页面')
        } catch (err) {
          console.error('[GoogleAuth] 打开浏览器失败:', err)
          resolveOnce(null)
        }
      })

      // 设置超时（3分钟，增加到180秒）
      const timeout = setTimeout(() => {
        if (!resolved) {
          console.log('[GoogleAuth] OAuth 超时（3分钟）')
          if (this.callbackServer) {
            try {
              this.callbackServer.close()
            } catch (e) {
              console.warn('[GoogleAuth] 关闭超时服务器失败:', e)
            }
            this.callbackServer = null
          }
          resolveOnce(null)
        }
      }, 180000)

      // 确保超时器被清理
      if (this.callbackServer) {
        this.callbackServer.on('close', () => {
          clearTimeout(timeout)
        })
      }
    })
  }

  /**
   * 获取用户信息
   */
  private async fetchUserInfo(): Promise<UserInfo | null> {
    try {
      const oauth2 = google.oauth2({ version: 'v2', auth: this.oauth2Client })
      const { data } = await oauth2.userinfo.get()

      return {
        id: data.id || '',
        email: data.email || '',
        name: data.name || '',
        picture: data.picture || ''
      }
    } catch (error) {
      console.error('Failed to fetch user info:', error)
      return null
    }
  }

  /**
   * 保存 token（加密）
   */
  private async saveTokens(tokens: TokenData) {
    const tokenStr = JSON.stringify(tokens)
    if (safeStorage.isEncryptionAvailable()) {
      const encrypted = safeStorage.encryptString(tokenStr)
      this.store.set('tokens_encrypted', encrypted.toString('base64'))
    } else {
      this.store.set('tokens', tokens)
    }
  }

  /**
   * 获取保存的 token
   */
  private getTokens(): TokenData | null {
    try {
      if (safeStorage.isEncryptionAvailable()) {
        const encrypted = this.store.get('tokens_encrypted') as string
        if (encrypted) {
          const decrypted = safeStorage.decryptString(Buffer.from(encrypted, 'base64'))
          return JSON.parse(decrypted)
        }
      } else {
        return this.store.get('tokens') as TokenData | null
      }
    } catch (error) {
      console.error('Failed to get tokens:', error)
    }
    return null
  }

  /**
   * 保存用户信息
   */
  private async saveUser(user: UserInfo) {
    this.store.set('user', user)
  }

  /**
   * 获取当前用户
   */
  async getUser(): Promise<UserInfo | null> {
    return this.store.get('user') as UserInfo | null
  }

  /**
   * 检查是否已登录
   */
  async isLoggedIn(): Promise<boolean> {
    const tokens = this.getTokens()
    const user = await this.getUser()
    return !!tokens && !!user
  }

  /**
   * 登出
   */
  async logout(): Promise<void> {
    this.store.delete('tokens')
    this.store.delete('tokens_encrypted')
    this.store.delete('user')
    if (this.oauth2Client) {
      try {
        this.oauth2Client.revokeCredentials()
      } catch (e) {
        // 忽略撤销错误
      }
    }
  }

  /**
   * 获取 OAuth2 客户端（供 Drive 服务使用）
   */
  getOAuth2Client() {
    // 确保使用最新配置
    this.initOAuth2Client()

    if (!this.oauth2Client) {
      return null
    }

    const tokens = this.getTokens()
    if (tokens) {
      this.oauth2Client.setCredentials(tokens)
    }
    return this.oauth2Client
  }

  /**
   * 刷新 token
   */
  async refreshToken(): Promise<boolean> {
    try {
      if (!this.oauth2Client) {
        this.initOAuth2Client()
      }

      if (!this.oauth2Client) {
        return false
      }

      const tokens = this.getTokens()
      if (!tokens?.refresh_token) {
        return false
      }

      this.oauth2Client.setCredentials(tokens)
      const { credentials } = await this.oauth2Client.refreshAccessToken()
      await this.saveTokens(credentials)
      return true
    } catch (error) {
      console.error('Failed to refresh token:', error)
      return false
    }
  }
}
