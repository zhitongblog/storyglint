import { ServerAuthService } from './server-auth'
import { DatabaseService } from './database'
import type { Project } from '../../src/types'

interface SyncResult {
  success: boolean
  uploaded?: number
  downloaded?: number
  deleted?: number
  skippedDeleted?: number
  conflicts?: number
  errors?: string[]
  error?: string
}

interface ProjectMetadata {
  id: string
  title?: string
  lastModifiedAt: string
  syncedAt?: string
  version: number
  checksum: string
  fileSize?: number
}

/**
 * 服务端同步服务
 * 管理本地数据与 StoryGlint 服务端的同步
 */
export class ServerSyncService {
  private authService: ServerAuthService
  private database: DatabaseService
  private serverUrl: string

  constructor(authService: ServerAuthService, database: DatabaseService) {
    this.authService = authService
    this.database = database
    this.serverUrl = authService.getServerUrl()
  }

  /**
   * 执行完整同步
   * 1. 检查登录状态和用户权限
   * 2. 获取服务端项目列表
   * 3. 比较本地和服务端版本
   * 4. 上传更新的本地项目
   * 5. 下载更新的服务端项目
   */
  async sync(): Promise<SyncResult> {
    try {
      console.log('[ServerSync] 开始同步...')

      // 检查登录状态
      if (!this.authService.isLoggedIn()) {
        return {
          success: false,
          error: '未登录'
        }
      }

      // 检查用户状态（从服务器获取最新状态，确保已批准的账号能正常同步）
      const userStatus = await this.authService.checkUserStatus()
      if (!userStatus.isApproved) {
        return {
          success: false,
          error: userStatus.message || '用户未获批准'
        }
      }

      // 获取访问令牌
      const accessToken = this.authService.getAccessToken()
      if (!accessToken) {
        return {
          success: false,
          error: '无法获取访问令牌'
        }
      }

      // 首先同步本地删除到服务端
      const deletionResult = await this.syncDeletions(accessToken)
      console.log('[ServerSync] 删除同步完成:', deletionResult)

      // 获取本地项目列表
      const localProjects = await this.database.getProjects()
      console.log('[ServerSync] 本地项目数量:', localProjects.length)

      // 获取服务端项目列表
      const serverProjects = await this.fetchServerProjects(accessToken)
      console.log('[ServerSync] 服务端项目数量:', serverProjects.length)

      // 比较并同步
      const result = await this.compareAndSync(localProjects, serverProjects, accessToken)

      // 合并删除同步的结果
      result.deleted = deletionResult.deleted
      if (deletionResult.errors.length > 0) {
        result.errors = [...(result.errors || []), ...deletionResult.errors]
      }

      console.log('[ServerSync] 同步完成:', result)
      return result
    } catch (error: any) {
      console.error('[ServerSync] 同步失败:', error)
      return {
        success: false,
        error: error.message
      }
    }
  }

  /**
   * 获取服务端项目列表
   */
  private async fetchServerProjects(accessToken: string): Promise<ProjectMetadata[]> {
    const response = await fetch(`${this.serverUrl}/api/sync/projects`, {
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    })

    if (!response.ok) {
      throw new Error(`获取服务端项目列表失败: HTTP ${response.status}`)
    }

    const data = await response.json()

    if (!data.success) {
      throw new Error(data.error || '获取项目列表失败')
    }

    return data.data?.projects || []
  }

  /**
   * 比较并同步项目
   */
  private async compareAndSync(
    localProjects: Project[],
    serverProjects: ProjectMetadata[],
    accessToken: string
  ): Promise<SyncResult> {
    let uploaded = 0
    let downloaded = 0
    let conflicts = 0
    const errors: string[] = []

    // 创建服务端项目映射
    const serverProjectMap = new Map<string, ProjectMetadata>()
    serverProjects.forEach((p) => serverProjectMap.set(p.id, p))

    // 创建本地项目映射
    const localProjectMap = new Map<string, Project>()
    localProjects.forEach((p) => localProjectMap.set(p.id, p))

    // 遍历本地项目，上传新的或更新的
    for (const localProject of localProjects) {
      try {
        const serverProject = serverProjectMap.get(localProject.id)

        if (!serverProject) {
          // 本地有，服务端没有 -> 上传
          console.log('[ServerSync] 上传新项目:', localProject.title)
          await this.uploadProject(localProject, accessToken)
          uploaded++
        } else {
          // 优先比较版本号，时间戳作为辅助
          const localVersion = localProject.version || 0
          const serverVersion = serverProject.version || 0
          const localTime = new Date(localProject.updatedAt).getTime()
          const serverTime = new Date(serverProject.lastModifiedAt).getTime()

          console.log(`[ServerSync] 比较项目 ${localProject.title}: 本地版本=${localVersion}, 服务端版本=${serverVersion}`)

          if (localVersion > serverVersion) {
            // 本地版本更高 -> 上传
            console.log('[ServerSync] 本地版本更高，上传项目:', localProject.title)
            await this.uploadProject(localProject, accessToken)
            uploaded++
          } else if (serverVersion > localVersion) {
            // 服务端版本更高 -> 下载
            console.log('[ServerSync] 服务端版本更高，下载项目:', localProject.title)
            await this.downloadProject(serverProject.id, accessToken)
            downloaded++
          } else {
            // 版本相同，使用时间戳作为辅助判断
            if (localTime > serverTime) {
              console.log('[ServerSync] 版本相同但本地时间更新，上传项目:', localProject.title)
              await this.uploadProject(localProject, accessToken)
              uploaded++
            } else if (serverTime > localTime) {
              console.log('[ServerSync] 版本相同但服务端时间更新，下载项目:', localProject.title)
              await this.downloadProject(serverProject.id, accessToken)
              downloaded++
            }
            // 版本和时间都相同 -> 无需同步
          }
        }
      } catch (error: any) {
        console.error('[ServerSync] 同步项目失败:', localProject.title, error)
        errors.push(`${localProject.title}: ${error.message}`)

        // 检查是否是冲突
        if (error.message.includes('冲突') || error.message.includes('conflict')) {
          conflicts++
        }
      }
    }

    // 遍历服务端项目，下载本地没有的
    let skippedDeleted = 0
    for (const serverProject of serverProjects) {
      if (!localProjectMap.has(serverProject.id)) {
        // 检查项目是否在删除记录中
        if (this.database.isProjectDeleted(serverProject.id)) {
          // 项目已被本地删除，跳过下载
          console.log('[ServerSync] 跳过已删除的项目:', serverProject.title)
          skippedDeleted++
          continue
        }

        try {
          // 服务端有，本地没有 -> 下载
          console.log('[ServerSync] 下载新项目:', serverProject.title)
          await this.downloadProject(serverProject.id, accessToken)
          downloaded++
        } catch (error: any) {
          console.error('[ServerSync] 下载项目失败:', serverProject.title, error)
          errors.push(`${serverProject.title}: ${error.message}`)
        }
      }
    }

    return {
      success: errors.length === 0,
      uploaded,
      downloaded,
      skippedDeleted,
      conflicts,
      errors: errors.length > 0 ? errors : undefined
    }
  }

  /**
   * 上传单个项目
   */
  async uploadProject(project: Project, accessToken?: string): Promise<void> {
    const token = accessToken || this.authService.getAccessToken()
    if (!token) {
      throw new Error('无法获取访问令牌')
    }

    // 获取完整项目数据（包括所有卷、章节、角色等）
    const projectData = await this.exportProjectData(project.id)

    // 计算校验和
    const checksum = this.calculateChecksum(JSON.stringify(projectData))

    const response = await fetch(`${this.serverUrl}/api/sync/upload`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({
        id: project.id,
        title: project.title,
        data: projectData,
        lastModifiedAt: project.updatedAt,
        checksum
      })
    })

    if (!response.ok) {
      if (response.status === 409) {
        throw new Error('检测到同步冲突')
      }
      throw new Error(`上传失败: HTTP ${response.status}`)
    }

    const data = await response.json()

    if (!data.success) {
      throw new Error(data.error || '上传失败')
    }

    console.log('[ServerSync] 项目上传成功:', project.title)
  }

  /**
   * 下载单个项目
   */
  async downloadProject(projectId: string, accessToken?: string): Promise<void> {
    const token = accessToken || this.authService.getAccessToken()
    if (!token) {
      throw new Error('无法获取访问令牌')
    }

    const response = await fetch(`${this.serverUrl}/api/sync/download/${projectId}`, {
      headers: {
        Authorization: `Bearer ${token}`
      }
    })

    if (!response.ok) {
      throw new Error(`下载失败: HTTP ${response.status}`)
    }

    const data = await response.json()

    if (!data.success || !data.data?.project) {
      throw new Error(data.error || '下载失败')
    }

    const { project: serverProject } = data.data

    // 导入项目数据到本地数据库
    await this.importProjectData(serverProject.data, serverProject)

    console.log('[ServerSync] 项目下载成功:', serverProject.title)
  }

  /**
   * 批量上传项目
   */
  async batchUpload(projectIds: string[]): Promise<SyncResult> {
    try {
      const token = this.authService.getAccessToken()
      if (!token) {
        throw new Error('无法获取访问令牌')
      }

      console.log('[ServerSync] 批量上传', projectIds.length, '个项目')

      // 准备项目数据
      const projects = []
      for (const id of projectIds) {
        const project = await this.database.getProject(id)
        if (project) {
          const projectData = await this.exportProjectData(id)
          const checksum = this.calculateChecksum(JSON.stringify(projectData))

          projects.push({
            id: project.id,
            title: project.title,
            data: projectData,
            lastModifiedAt: project.updatedAt,
            checksum
          })
        }
      }

      // 批量上传
      const response = await fetch(`${this.serverUrl}/api/sync/batch-upload`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ projects })
      })

      if (!response.ok) {
        throw new Error(`批量上传失败: HTTP ${response.status}`)
      }

      const data = await response.json()

      if (!data.success) {
        throw new Error(data.error || '批量上传失败')
      }

      console.log('[ServerSync] 批量上传完成:', data.data)

      return {
        success: true,
        uploaded: data.data.uploaded,
        errors: data.data.errors?.map((e: any) => `${e.id}: ${e.error}`)
      }
    } catch (error: any) {
      console.error('[ServerSync] 批量上传失败:', error)
      return {
        success: false,
        error: error.message
      }
    }
  }

  /**
   * 从服务端恢复所有数据
   */
  async restore(): Promise<{
    success: boolean
    importedCount?: number
    errors?: string[]
    error?: string
  }> {
    try {
      console.log('[ServerSync] 开始从服务端恢复数据...')

      const token = this.authService.getAccessToken()
      if (!token) {
        throw new Error('无法获取访问令牌')
      }

      // 获取所有服务端项目
      const serverProjects = await this.fetchServerProjects(token)
      console.log('[ServerSync] 服务端共有', serverProjects.length, '个项目')

      let importedCount = 0
      const errors: string[] = []

      // 逐个下载并导入
      for (const serverProject of serverProjects) {
        try {
          await this.downloadProject(serverProject.id, token)
          importedCount++
        } catch (error: any) {
          console.error('[ServerSync] 导入项目失败:', serverProject.title, error)
          errors.push(`${serverProject.title}: ${error.message}`)
        }
      }

      console.log('[ServerSync] 恢复完成，成功:', importedCount, '失败:', errors.length)

      return {
        success: errors.length === 0,
        importedCount,
        errors: errors.length > 0 ? errors : undefined
      }
    } catch (error: any) {
      console.error('[ServerSync] 恢复失败:', error)
      return {
        success: false,
        error: error.message
      }
    }
  }

  /**
   * 导出项目完整数据
   */
  private async exportProjectData(projectId: string): Promise<any> {
    // 获取项目基本信息
    const project = await this.database.getProject(projectId)
    if (!project) {
      throw new Error('项目不存在')
    }

    // 获取卷
    const volumes = await this.database.getVolumes(projectId)

    // 获取所有章节
    const chapters = []
    for (const volume of volumes) {
      const volumeChapters = await this.database.getChapters(volume.id)
      chapters.push(...volumeChapters)
    }

    // 获取角色
    const characters = await this.database.getCharacters(projectId)

    return {
      project,
      volumes,
      chapters,
      characters
    }
  }

  /**
   * 导入项目完整数据
   */
  private async importProjectData(data: any, metadata: any): Promise<void> {
    const { project, volumes, chapters, characters } = data

    // 导入项目
    await this.database.createOrUpdateProject({
      ...project,
      updatedAt: metadata.lastModifiedAt
    })

    // 导入卷
    for (const volume of volumes || []) {
      await this.database.createOrUpdateVolume(volume)
    }

    // 导入章节
    for (const chapter of chapters || []) {
      await this.database.createOrUpdateChapter(chapter)
    }

    // 导入角色
    for (const character of characters || []) {
      await this.database.createOrUpdateCharacter(character)
    }
  }

  /**
   * 计算简单的校验和
   */
  private calculateChecksum(data: string): string {
    // 简单的哈希函数
    let hash = 0
    for (let i = 0; i < data.length; i++) {
      const char = data.charCodeAt(i)
      hash = (hash << 5) - hash + char
      hash = hash & hash // 转换为32位整数
    }
    return Math.abs(hash).toString(36)
  }

  /**
   * 从服务端删除项目
   */
  async deleteServerProject(projectId: string, accessToken?: string): Promise<void> {
    const token = accessToken || this.authService.getAccessToken()
    if (!token) {
      throw new Error('无法获取访问令牌')
    }

    const response = await fetch(`${this.serverUrl}/api/sync/project/${projectId}`, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${token}`
      }
    })

    if (!response.ok) {
      // 404 表示服务端已经没有这个项目，视为成功
      if (response.status === 404) {
        console.log('[ServerSync] 服务端项目已不存在:', projectId)
        return
      }
      throw new Error(`删除失败: HTTP ${response.status}`)
    }

    const data = await response.json()

    if (!data.success) {
      throw new Error(data.error || '删除失败')
    }

    console.log('[ServerSync] 服务端项目删除成功:', projectId)
  }

  /**
   * 同步本地删除到服务端
   */
  private async syncDeletions(accessToken: string): Promise<{ deleted: number; errors: string[] }> {
    let deleted = 0
    const errors: string[] = []

    // 获取未同步的删除记录
    const deletions = this.database.getUnsyncedDeletions()
    console.log('[ServerSync] 待同步的删除记录:', deletions.length)

    for (const deletion of deletions) {
      try {
        await this.deleteServerProject(deletion.id, accessToken)
        this.database.markDeletionSynced(deletion.id)
        deleted++
        console.log('[ServerSync] 已同步删除:', deletion.title)
      } catch (error: any) {
        console.error('[ServerSync] 同步删除失败:', deletion.title, error)
        errors.push(`删除 ${deletion.title}: ${error.message}`)
      }
    }

    // 清理旧的删除记录
    this.database.cleanupOldDeletions()

    return { deleted, errors }
  }
}
