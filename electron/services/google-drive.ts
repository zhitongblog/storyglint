import { google, drive_v3 } from 'googleapis'
import { GoogleAuthService } from './google-auth'

const APP_FOLDER_NAME = 'StoryGlint'

export class GoogleDriveService {
  private authService: GoogleAuthService
  private drive: drive_v3.Drive | null = null
  private appFolderId: string | null = null

  constructor(authService: GoogleAuthService) {
    this.authService = authService
  }

  /**
   * 初始化 Drive 客户端
   */
  private async initDrive(): Promise<drive_v3.Drive> {
    if (!this.drive) {
      const auth = this.authService.getOAuth2Client()
      this.drive = google.drive({ version: 'v3', auth })
    }
    return this.drive
  }

  /**
   * 获取或创建应用文件夹
   */
  private async getOrCreateAppFolder(): Promise<string> {
    if (this.appFolderId) {
      return this.appFolderId
    }

    const drive = await this.initDrive()

    // 查找现有文件夹
    const response = await drive.files.list({
      q: `name='${APP_FOLDER_NAME}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
      spaces: 'drive',
      fields: 'files(id, name)'
    })

    if (response.data.files && response.data.files.length > 0) {
      this.appFolderId = response.data.files[0].id!
      return this.appFolderId
    }

    // 创建新文件夹
    const folderMetadata = {
      name: APP_FOLDER_NAME,
      mimeType: 'application/vnd.google-apps.folder'
    }

    const folder = await drive.files.create({
      requestBody: folderMetadata,
      fields: 'id'
    })

    this.appFolderId = folder.data.id!
    return this.appFolderId
  }

  /**
   * 上传文件到 Drive
   */
  async uploadFile(
    fileName: string,
    data: any,
    existingFileId?: string
  ): Promise<{ success: boolean; fileId?: string; error?: string }> {
    try {
      const drive = await this.initDrive()
      const folderId = await this.getOrCreateAppFolder()

      // 将数据转换为 JSON 字符串并创建 Buffer
      const jsonString = JSON.stringify(data, null, 2)
      const buffer = Buffer.from(jsonString, 'utf-8')

      let response

      if (existingFileId) {
        // 更新现有文件 - 使用 multipart upload
        response = await drive.files.update({
          fileId: existingFileId,
          media: {
            mimeType: 'application/json',
            body: buffer
          },
          fields: 'id, name'
        })
        console.log(`Updated file: ${fileName} (ID: ${response.data.id})`)
      } else {
        // 创建新文件 - 使用 multipart upload
        response = await drive.files.create({
          requestBody: {
            name: fileName,
            parents: [folderId],
            mimeType: 'application/json'
          },
          media: {
            mimeType: 'application/json',
            body: buffer
          },
          fields: 'id, name'
        })
        console.log(`Created file: ${fileName} (ID: ${response.data.id})`)
      }

      return { success: true, fileId: response.data.id! }
    } catch (error: any) {
      console.error(`Upload error for ${fileName}:`, error)
      // 返回更详细的错误信息
      const errorMessage = error.response?.data?.error?.message || error.message || '未知错误'
      return { success: false, error: errorMessage }
    }
  }

  /**
   * 从 Drive 下载文件
   */
  async downloadFile(fileId: string): Promise<{ success: boolean; data?: any; error?: string }> {
    try {
      const drive = await this.initDrive()

      const response = await drive.files.get({
        fileId: fileId,
        alt: 'media'
      })

      return { success: true, data: response.data }
    } catch (error: any) {
      console.error('Download error:', error)
      return { success: false, error: error.message }
    }
  }

  /**
   * 列出应用文件夹中的所有文件
   */
  async listFiles(): Promise<{ success: boolean; files?: any[]; error?: string }> {
    try {
      const drive = await this.initDrive()
      const folderId = await this.getOrCreateAppFolder()

      const response = await drive.files.list({
        q: `'${folderId}' in parents and trashed=false`,
        spaces: 'drive',
        fields: 'files(id, name, modifiedTime, size)',
        orderBy: 'modifiedTime desc'
      })

      return { success: true, files: response.data.files || [] }
    } catch (error: any) {
      console.error('List files error:', error)
      return { success: false, error: error.message }
    }
  }

  /**
   * 删除文件
   */
  async deleteFile(fileId: string): Promise<{ success: boolean; error?: string }> {
    try {
      const drive = await this.initDrive()
      await drive.files.delete({ fileId })
      return { success: true }
    } catch (error: any) {
      console.error('Delete error:', error)
      return { success: false, error: error.message }
    }
  }

  /**
   * 同步所有项目数据
   */
  async syncAll(localData: any[]): Promise<{ success: boolean; error?: string; uploadedCount?: number; errors?: string[] }> {
    try {
      console.log('[GoogleDrive] Starting sync, total projects:', localData.length)

      const drive = await this.initDrive()
      const folderId = await this.getOrCreateAppFolder()
      console.log('[GoogleDrive] App folder ID:', folderId)

      // 过滤掉空数据
      const validData = localData.filter(data => {
        if (!data) {
          console.warn('[GoogleDrive] Skipping null/undefined data')
          return false
        }
        if (!data.project) {
          console.warn('[GoogleDrive] Skipping data without project field')
          return false
        }
        if (!data.project.id) {
          console.warn('[GoogleDrive] Skipping project without ID')
          return false
        }
        return true
      })

      console.log('[GoogleDrive] Valid projects to sync:', validData.length)

      if (validData.length === 0) {
        console.log('[GoogleDrive] No valid projects to sync')
        return { success: true, uploadedCount: 0 }
      }

      // 获取远程文件列表
      console.log('[GoogleDrive] Fetching remote file list...')
      const remoteFiles = await this.listFiles()
      if (!remoteFiles.success) {
        console.error('[GoogleDrive] Failed to list files:', remoteFiles.error)
        return { success: false, error: remoteFiles.error }
      }

      console.log('[GoogleDrive] Remote files count:', remoteFiles.files?.length || 0)

      const remoteFileMap = new Map(
        (remoteFiles.files || []).map((f: any) => [f.name, f])
      )

      let uploadedCount = 0
      const errors: string[] = []

      // 同步每个项目
      for (const projectData of validData) {
        try {
          // 导出的数据结构是 { project, volumes, chapters, characters }
          const fileName = `project_${projectData.project.id}.json`
          const existingFile = remoteFileMap.get(fileName)

          console.log(`[GoogleDrive] ${existingFile ? 'Updating' : 'Creating'}: ${fileName}`)
          console.log(`[GoogleDrive] Project title: ${projectData.project.title}`)

          const result = await this.uploadFile(fileName, projectData, existingFile?.id)
          if (result.success) {
            uploadedCount++
            console.log(`[GoogleDrive] ✓ Success: ${fileName}`)
          } else {
            const errorMsg = `${fileName}: ${result.error}`
            errors.push(errorMsg)
            console.error(`[GoogleDrive] ✗ Failed: ${errorMsg}`)
          }
        } catch (error: any) {
          const errorMsg = `${projectData.project.title}: ${error.message}`
          errors.push(errorMsg)
          console.error(`[GoogleDrive] ✗ Exception:`, error)
        }
      }

      console.log(`[GoogleDrive] Sync complete: ${uploadedCount}/${validData.length} succeeded`)

      if (errors.length > 0) {
        console.error('[GoogleDrive] Errors:', errors)
      }

      return {
        success: uploadedCount > 0 || validData.length === 0,
        uploadedCount,
        errors: errors.length > 0 ? errors : undefined
      }
    } catch (error: any) {
      console.error('[GoogleDrive] Sync fatal error:', error)
      return { success: false, error: error.message || '同步失败' }
    }
  }
}
