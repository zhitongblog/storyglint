/**
 * StoryGlint 服务端 API 客户端
 * 处理所有与服务端的HTTP通信
 */

interface ApiConfig {
  baseUrl: string
  accessToken?: string
  refreshToken?: string
}

interface ApiResponse<T = any> {
  success: boolean
  data?: T
  message?: string
  error?: string
}

interface User {
  id: string
  googleId: string
  email: string
  name?: string
  picture?: string
  status: 'pending' | 'approved' | 'rejected' | 'suspended'
  role: 'user' | 'admin'
  createdAt: string
  lastLoginAt?: string
}

interface Project {
  id: string
  title?: string
  lastModifiedAt: string
  syncedAt?: string
  version: number
  checksum: string
  fileSize?: number
}

interface ProjectData {
  id: string
  title?: string
  data: any
  lastModifiedAt: string
  checksum?: string
}

class ApiClient {
  private config: ApiConfig
  private tokenRefreshPromise: Promise<boolean> | null = null

  constructor(config: ApiConfig) {
    this.config = config
  }

  /**
   * 更新配置
   */
  updateConfig(updates: Partial<ApiConfig>): void {
    this.config = { ...this.config, ...updates }
  }

  /**
   * 设置访问令牌
   */
  setAccessToken(token: string): void {
    this.config.accessToken = token
  }

  /**
   * 设置刷新令牌
   */
  setRefreshToken(token: string): void {
    this.config.refreshToken = token
  }

  /**
   * 清除所有令牌
   */
  clearTokens(): void {
    this.config.accessToken = undefined
    this.config.refreshToken = undefined
  }

  /**
   * 执行HTTP请求
   */
  private async request<T = any>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<ApiResponse<T>> {
    const url = `${this.config.baseUrl}${endpoint}`
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string> || {})
    }

    // 添加访问令牌
    if (this.config.accessToken) {
      headers['Authorization'] = `Bearer ${this.config.accessToken}`
    }

    try {
      const response = await fetch(url, {
        ...options,
        headers
      })

      // 处理 401 未授权（token 过期）
      if (response.status === 401 && this.config.refreshToken) {
        // 尝试刷新 token
        const refreshed = await this.refreshAccessToken()
        if (refreshed) {
          // 重试原请求
          headers['Authorization'] = `Bearer ${this.config.accessToken}`
          const retryResponse = await fetch(url, {
            ...options,
            headers
          })
          return await retryResponse.json()
        }
      }

      // 解析响应
      const data = await response.json()

      // 处理错误状态码
      if (!response.ok) {
        return {
          success: false,
          error: data.error || data.message || `HTTP ${response.status}`
        }
      }

      return data
    } catch (error: any) {
      console.error('[API Client] 请求失败:', error)
      return {
        success: false,
        error: error.message || '网络请求失败'
      }
    }
  }

  // ==================== 认证相关 ====================

  /**
   * 刷新访问令牌
   */
  async refreshAccessToken(): Promise<boolean> {
    // 避免重复刷新
    if (this.tokenRefreshPromise) {
      return this.tokenRefreshPromise
    }

    this.tokenRefreshPromise = (async () => {
      try {
        if (!this.config.refreshToken) {
          return false
        }

        const response = await fetch(`${this.config.baseUrl}/api/auth/refresh`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            refreshToken: this.config.refreshToken
          })
        })

        if (!response.ok) {
          return false
        }

        const data = await response.json()
        if (data.success && data.data?.accessToken) {
          this.config.accessToken = data.data.accessToken
          return true
        }

        return false
      } catch (error) {
        console.error('[API Client] 刷新令牌失败:', error)
        return false
      } finally {
        this.tokenRefreshPromise = null
      }
    })()

    return this.tokenRefreshPromise
  }

  /**
   * 获取当前用户信息
   */
  async getCurrentUser(): Promise<ApiResponse<{ user: User }>> {
    return this.request<{ user: User }>('/api/auth/me')
  }

  /**
   * 检查认证状态
   */
  async checkAuthStatus(): Promise<ApiResponse<{ isAuthenticated: boolean; user?: User }>> {
    return this.request<{ isAuthenticated: boolean; user?: User }>('/api/auth/status')
  }

  /**
   * 登出
   */
  async logout(): Promise<ApiResponse> {
    const result = await this.request('/api/auth/logout', {
      method: 'POST'
    })
    this.clearTokens()
    return result
  }

  /**
   * 登出所有设备
   */
  async logoutAll(): Promise<ApiResponse> {
    const result = await this.request('/api/auth/logout-all', {
      method: 'POST'
    })
    this.clearTokens()
    return result
  }

  // ==================== 同步相关 ====================

  /**
   * 获取项目列表
   */
  async listProjects(): Promise<ApiResponse<{ projects: Project[] }>> {
    return this.request<{ projects: Project[] }>('/api/sync/projects')
  }

  /**
   * 上传/同步项目
   */
  async uploadProject(projectData: ProjectData): Promise<
    ApiResponse<{
      project: {
        id: string
        version: number
        syncedAt: string
        checksum: string
      }
    }>
  > {
    return this.request('/api/sync/upload', {
      method: 'POST',
      body: JSON.stringify(projectData)
    })
  }

  /**
   * 批量上传项目
   */
  async batchUploadProjects(
    projects: ProjectData[]
  ): Promise<
    ApiResponse<{
      uploaded: number
      failed: number
      results: Array<{ id: string; success: boolean; version?: number }>
      errors: Array<{ id: string; error: string }>
    }>
  > {
    return this.request('/api/sync/batch-upload', {
      method: 'POST',
      body: JSON.stringify({ projects })
    })
  }

  /**
   * 下载项目
   */
  async downloadProject(
    id: string
  ): Promise<
    ApiResponse<{
      project: {
        id: string
        title?: string
        data: any
        lastModifiedAt: string
        version: number
        checksum: string
      }
    }>
  > {
    return this.request(`/api/sync/download/${id}`)
  }

  /**
   * 删除项目
   */
  async deleteProject(id: string): Promise<ApiResponse> {
    return this.request(`/api/sync/project/${id}`, {
      method: 'DELETE'
    })
  }

  // ==================== 管理员相关 ====================

  /**
   * 获取用户列表（管理员）
   */
  async listUsers(params?: {
    status?: string
    page?: number
    limit?: number
  }): Promise<
    ApiResponse<{
      users: User[]
      total: number
      page: number
      limit: number
    }>
  > {
    const query = new URLSearchParams()
    if (params?.status) query.append('status', params.status)
    if (params?.page) query.append('page', params.page.toString())
    if (params?.limit) query.append('limit', params.limit.toString())

    const queryString = query.toString()
    const endpoint = `/api/admin/users${queryString ? `?${queryString}` : ''}`

    return this.request(endpoint)
  }

  /**
   * 批准用户（管理员）
   */
  async approveUser(userId: string): Promise<ApiResponse<{ user: User }>> {
    return this.request(`/api/admin/users/${userId}/approve`, {
      method: 'POST'
    })
  }

  /**
   * 拒绝用户（管理员）
   */
  async rejectUser(userId: string, reason?: string): Promise<ApiResponse<{ user: User }>> {
    return this.request(`/api/admin/users/${userId}/reject`, {
      method: 'POST',
      body: JSON.stringify({ reason })
    })
  }

  /**
   * 暂停用户（管理员）
   */
  async suspendUser(userId: string, reason?: string): Promise<ApiResponse<{ user: User }>> {
    return this.request(`/api/admin/users/${userId}/suspend`, {
      method: 'POST',
      body: JSON.stringify({ reason })
    })
  }

  /**
   * 批量批准用户（管理员）
   */
  async batchApproveUsers(
    userIds: string[]
  ): Promise<
    ApiResponse<{
      approved: number
      failed: number
      results: Array<{ userId: string; success: boolean }>
    }>
  > {
    return this.request('/api/admin/users/batch-approve', {
      method: 'POST',
      body: JSON.stringify({ userIds })
    })
  }

  /**
   * 获取系统统计信息（管理员）
   */
  async getStats(): Promise<
    ApiResponse<{
      users: {
        total: number
        pending: number
        approved: number
        rejected: number
        suspended: number
      }
      storage: {
        totalSize: number
        projectCount: number
        avgSize: number
      }
      sync: {
        total: number
        successCount: number
        failedCount: number
        conflictCount: number
      }
    }>
  > {
    return this.request('/api/admin/stats')
  }
}

// 导出单例
let apiClientInstance: ApiClient | null = null

export function getApiClient(config?: ApiConfig): ApiClient {
  if (!apiClientInstance && config) {
    apiClientInstance = new ApiClient(config)
  } else if (!apiClientInstance) {
    throw new Error('API Client not initialized. Please provide config on first call.')
  }
  return apiClientInstance
}

export function initializeApiClient(config: ApiConfig): ApiClient {
  apiClientInstance = new ApiClient(config)
  return apiClientInstance
}

export { ApiClient }
export type { ApiConfig, ApiResponse, User, Project, ProjectData }
