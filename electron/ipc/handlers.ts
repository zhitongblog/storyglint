import { IpcMain, BrowserWindow, shell, app, SafeStorage, net } from 'electron'
import Store from 'electron-store'
import { GoogleAuthService } from '../services/google-auth'
import { GoogleDriveService } from '../services/google-drive'
import { ServerAuthService } from '../services/server-auth'
import { ServerSyncService } from '../services/server-sync'
import { ServerAdminService } from '../services/server-admin'
import { DatabaseService } from '../services/database'

interface Services {
  mainWindow: () => BrowserWindow | null
  googleAuth: GoogleAuthService
  googleDrive: GoogleDriveService
  serverAuth?: ServerAuthService
  serverSync?: ServerSyncService
  serverAdmin?: ServerAdminService
  database: DatabaseService
  safeStorage: SafeStorage
}

export function setupIpcHandlers(ipcMain: IpcMain, services: Services) {
  const { mainWindow, googleAuth, googleDrive, serverAuth, serverSync, serverAdmin, database } = services

  // 设置存储（与 google-auth 使用相同的 store）
  const settingsStore = new Store({
    name: 'storyglint-settings'
  })

  // ==================== 窗口控制 ====================

  ipcMain.on('window:minimize', () => {
    mainWindow()?.minimize()
  })

  ipcMain.on('window:maximize', () => {
    const win = mainWindow()
    if (win) {
      if (win.isMaximized()) {
        win.unmaximize()
      } else {
        win.maximize()
      }
    }
  })

  ipcMain.on('window:close', () => {
    mainWindow()?.close()
  })

  // ==================== Google 认证 ====================

  ipcMain.handle('auth:login', async () => {
    return await googleAuth.login()
  })

  ipcMain.handle('auth:logout', async () => {
    await googleAuth.logout()
  })

  ipcMain.handle('auth:getUser', async () => {
    return await googleAuth.getUser()
  })

  ipcMain.handle('auth:isLoggedIn', async () => {
    return await googleAuth.isLoggedIn()
  })

  // ==================== Google Drive ====================

  ipcMain.handle('drive:sync', async () => {
    const projects = database.getProjects()
    const projectsData = projects.map((p) => database.exportProjectData(p.id))
    return await googleDrive.syncAll(projectsData)
  })

  ipcMain.handle('drive:upload', async (_, data) => {
    const fileName = `project_${data.id || 'unknown'}.json`
    return await googleDrive.uploadFile(fileName, data)
  })

  ipcMain.handle('drive:download', async (_, fileId) => {
    return await googleDrive.downloadFile(fileId)
  })

  ipcMain.handle('drive:list', async () => {
    return await googleDrive.listFiles()
  })

  ipcMain.handle('drive:restore', async () => {
    try {
      const listResult = await googleDrive.listFiles()
      if (!listResult.success || !listResult.files) {
        return { success: false, error: listResult.error || '获取文件列表失败' }
      }

      let importedCount = 0
      const errors: string[] = []

      // 下载并导入每个项目文件
      for (const file of listResult.files) {
        if (file.name.startsWith('project_') && file.name.endsWith('.json')) {
          try {
            const downloadResult = await googleDrive.downloadFile(file.id)
            if (downloadResult.success && downloadResult.data) {
              const importResult = database.importProjectData(downloadResult.data, {
                overwrite: false,
                generateNewIds: true
              })
              if (importResult.success) {
                importedCount++
              } else {
                errors.push(`${file.name}: ${importResult.error}`)
              }
            }
          } catch (error: any) {
            errors.push(`${file.name}: ${error.message}`)
          }
        }
      }

      return {
        success: errors.length === 0 || importedCount > 0,
        importedCount,
        errors: errors.length > 0 ? errors : undefined
      }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  // ==================== 数据库 - 项目 ====================

  ipcMain.handle('db:getProjects', () => {
    return database.getProjects()
  })

  ipcMain.handle('db:getProject', (_, id) => {
    return database.getProject(id)
  })

  ipcMain.handle('db:createProject', (_, project) => {
    return database.createProject(project)
  })

  ipcMain.handle('db:updateProject', (_, id, data) => {
    return database.updateProject(id, data)
  })

  ipcMain.handle('db:deleteProject', (_, id) => {
    database.deleteProject(id)
  })

  ipcMain.handle('db:importProject', (_, data, options) => {
    return database.importProjectData(data, options)
  })

  ipcMain.handle('db:exportProject', (_, projectId) => {
    return database.exportProjectData(projectId)
  })

  // ==================== 数据库 - 卷 ====================

  ipcMain.handle('db:getVolumes', (_, projectId) => {
    return database.getVolumes(projectId)
  })

  ipcMain.handle('db:createVolume', (_, volume) => {
    return database.createVolume(volume)
  })

  ipcMain.handle('db:updateVolume', (_, id, data) => {
    return database.updateVolume(id, data)
  })

  ipcMain.handle('db:deleteVolume', (_, id) => {
    database.deleteVolume(id)
  })

  ipcMain.handle('db:trySetGeneratingLock', (_, volumeId) => {
    return database.trySetGeneratingLock(volumeId)
  })

  ipcMain.handle('db:clearGeneratingLock', (_, volumeId) => {
    database.clearGeneratingLock(volumeId)
  })

  ipcMain.handle('db:checkGeneratingLock', (_, volumeId) => {
    return database.checkGeneratingLock(volumeId)
  })

  // ==================== 数据库 - 章节 ====================

  ipcMain.handle('db:getChapters', (_, volumeId) => {
    return database.getChapters(volumeId)
  })

  ipcMain.handle('db:getChapter', (_, id) => {
    return database.getChapter(id)
  })

  ipcMain.handle('db:createChapter', (_, chapter) => {
    return database.createChapter(chapter)
  })

  ipcMain.handle('db:updateChapter', (_, id, data) => {
    return database.updateChapter(id, data)
  })

  ipcMain.handle('db:deleteChapter', (_, id) => {
    database.deleteChapter(id)
  })

  // 批量创建章节（使用事务，防止并发时序号重复）
  ipcMain.handle('db:createChaptersBatch', (_, chapters) => {
    return database.createChaptersBatch(chapters)
  })

  // ==================== 数据库 - 角色 ====================

  ipcMain.handle('db:getCharacters', (_, projectId) => {
    return database.getCharacters(projectId)
  })

  ipcMain.handle('db:getCharacter', (_, id) => {
    return database.getCharacter(id)
  })

  ipcMain.handle('db:createCharacter', (_, character) => {
    return database.createCharacter(character)
  })

  ipcMain.handle('db:updateCharacter', (_, id, data) => {
    return database.updateCharacter(id, data)
  })

  ipcMain.handle('db:deleteCharacter', (_, id) => {
    database.deleteCharacter(id)
  })

  // ==================== 设置（使用 electron-store） ====================

  ipcMain.handle('settings:get', (_, key) => {
    return settingsStore.get(key)
  })

  ipcMain.handle('settings:set', (_, key, value) => {
    settingsStore.set(key, value)
  })

  ipcMain.handle('settings:getAll', () => {
    return settingsStore.store
  })

  // ==================== 系统 ====================

  ipcMain.handle('system:getAppVersion', () => {
    return app.getVersion()
  })

  ipcMain.on('system:openExternal', (_, url) => {
    shell.openExternal(url)
  })

  // ==================== AI API 请求（通过主进程代理） ====================

  ipcMain.handle('ai:fetch', async (_, url: string, options: {
    method: string
    headers: Record<string, string>
    body?: string
  }) => {
    return new Promise((resolve) => {
      try {
        console.log(`[AI Fetch] 请求: ${options.method} ${url}`)

        const request = net.request({
          method: options.method,
          url: url
        })

        // 设置请求头
        if (options.headers) {
          Object.entries(options.headers).forEach(([key, value]) => {
            request.setHeader(key, value)
          })
        }

        let responseData = ''

        // 设置超时（60秒）
        const timeoutId = setTimeout(() => {
          request.abort()
          resolve({
            ok: false,
            status: 0,
            data: null,
            error: '请求超时（60秒）'
          })
        }, 60000)

        request.on('response', (response) => {
          console.log(`[AI Fetch] 响应状态: ${response.statusCode}`)

          response.on('data', (chunk) => {
            responseData += chunk.toString()
          })

          response.on('end', () => {
            clearTimeout(timeoutId)

            let data: any = responseData
            try {
              data = JSON.parse(responseData)
            } catch {
              // 保持原始字符串
            }

            resolve({
              ok: response.statusCode >= 200 && response.statusCode < 300,
              status: response.statusCode,
              data
            })
          })
        })

        request.on('error', (error: Error) => {
          clearTimeout(timeoutId)
          console.error(`[AI Fetch] 请求错误:`, error)

          let errorMessage = error.message || '网络请求失败'
          if (error.message.includes('ECONNREFUSED')) {
            errorMessage = '连接被拒绝'
          } else if (error.message.includes('ENOTFOUND')) {
            errorMessage = '无法解析服务器地址'
          } else if (error.message.includes('ETIMEDOUT')) {
            errorMessage = '连接超时'
          }

          resolve({
            ok: false,
            status: 0,
            data: null,
            error: errorMessage
          })
        })

        // 发送请求体
        if (options.body) {
          request.write(options.body)
        }

        request.end()
      } catch (error: any) {
        console.error(`[AI Fetch] 异常:`, error)
        resolve({
          ok: false,
          status: 0,
          data: null,
          error: error.message || '请求失败'
        })
      }
    })
  })

  // ==================== 服务端认证 ====================

  if (serverAuth) {
    ipcMain.handle('serverAuth:login', async () => {
      return await serverAuth.login()
    })

    ipcMain.handle('serverAuth:logout', async () => {
      await serverAuth.logout()
    })

    ipcMain.handle('serverAuth:getUser', () => {
      return serverAuth.getUser()
    })

    ipcMain.handle('serverAuth:isLoggedIn', () => {
      return serverAuth.isLoggedIn()
    })

    ipcMain.handle('serverAuth:checkUserStatus', async () => {
      return await serverAuth.checkUserStatus()
    })

    ipcMain.handle('serverAuth:refreshToken', async () => {
      return await serverAuth.refreshAccessToken()
    })

    ipcMain.handle('serverAuth:getAccessToken', () => {
      return serverAuth.getAccessToken()
    })

    ipcMain.handle('serverAuth:getTokens', () => {
      return serverAuth.getTokens()
    })

    ipcMain.handle('serverAuth:setServerUrl', (_, url) => {
      serverAuth.setServerUrl(url)
    })

    ipcMain.handle('serverAuth:getServerUrl', () => {
      return serverAuth.getServerUrl()
    })

    ipcMain.handle('serverAuth:testConnection', async (_, url?: string) => {
      const testUrl = url || serverAuth.getServerUrl()
      console.log('[IPC] testConnection 请求:', testUrl)

      return new Promise((resolve) => {
        try {
          const healthUrl = `${testUrl}/api/health`
          console.log('[IPC] 发起请求:', healthUrl)

          const request = net.request({
            method: 'GET',
            url: healthUrl
          })

          let responseData = ''

          // 设置超时
          const timeoutId = setTimeout(() => {
            request.abort()
            resolve({ success: false, error: '连接超时（10秒）' })
          }, 10000)

          request.on('response', (response) => {
            console.log('[IPC] 收到响应, 状态码:', response.statusCode)

            response.on('data', (chunk) => {
              responseData += chunk.toString()
            })

            response.on('end', () => {
              clearTimeout(timeoutId)
              console.log('[IPC] 响应数据:', responseData)

              if (response.statusCode === 200) {
                try {
                  const data = JSON.parse(responseData)
                  resolve({ success: true, data })
                } catch {
                  resolve({ success: true, data: responseData })
                }
              } else {
                resolve({ success: false, error: `HTTP ${response.statusCode}` })
              }
            })
          })

          request.on('error', (error: Error) => {
            clearTimeout(timeoutId)
            console.error('[IPC] 请求错误:', error)
            let errorMessage = '无法连接到服务端'
            if (error.message.includes('ECONNREFUSED')) {
              errorMessage = '连接被拒绝，请确认服务端已启动'
            } else if (error.message.includes('ENOTFOUND')) {
              errorMessage = '无法解析服务器地址'
            } else if (error.message) {
              errorMessage = error.message
            }
            resolve({ success: false, error: errorMessage })
          })

          request.end()
        } catch (error: any) {
          console.error('[IPC] testConnection 异常:', error)
          resolve({ success: false, error: error.message || '请求失败' })
        }
      })
    })
  }

  // ==================== 服务端同步 ====================

  if (serverSync) {
    ipcMain.handle('serverSync:sync', async () => {
      return await serverSync.sync()
    })

    ipcMain.handle('serverSync:uploadProject', async (_, projectId) => {
      const project = database.getProject(projectId)
      if (!project) {
        return { success: false, error: '项目不存在' }
      }
      return await serverSync.uploadProject(project)
    })

    ipcMain.handle('serverSync:batchUpload', async (_, projectIds) => {
      return await serverSync.batchUpload(projectIds)
    })

    ipcMain.handle('serverSync:restore', async () => {
      return await serverSync.restore()
    })
  }

  // ==================== 服务端管理员 ====================

  if (serverAdmin) {
    ipcMain.handle('serverAdmin:listUsers', async (_, params) => {
      return await serverAdmin.listUsers(params)
    })

    ipcMain.handle('serverAdmin:getStats', async () => {
      return await serverAdmin.getStats()
    })

    ipcMain.handle('serverAdmin:approveUser', async (_, userId) => {
      return await serverAdmin.approveUser(userId)
    })

    ipcMain.handle('serverAdmin:rejectUser', async (_, userId, reason) => {
      return await serverAdmin.rejectUser(userId, reason)
    })

    ipcMain.handle('serverAdmin:suspendUser', async (_, userId, reason) => {
      return await serverAdmin.suspendUser(userId, reason)
    })

    ipcMain.handle('serverAdmin:batchApprove', async (_, userIds) => {
      return await serverAdmin.batchApprove(userIds)
    })
  }
}
