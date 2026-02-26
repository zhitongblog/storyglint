import { contextBridge, ipcRenderer } from 'electron'

// 类型定义
export interface ElectronAPI {
  // 窗口控制
  window: {
    minimize: () => void
    maximize: () => void
    close: () => void
  }

  // Google 认证
  auth: {
    login: () => Promise<{ success: boolean; user?: any; error?: string }>
    logout: () => Promise<void>
    getUser: () => Promise<any | null>
    isLoggedIn: () => Promise<boolean>
  }

  // Google Drive 同步
  drive: {
    sync: () => Promise<{ success: boolean; error?: string }>
    upload: (data: any) => Promise<{ success: boolean; fileId?: string; error?: string }>
    download: (fileId: string) => Promise<{ success: boolean; data?: any; error?: string }>
    list: () => Promise<{ success: boolean; files?: any[]; error?: string }>
    restore: () => Promise<{ success: boolean; importedCount?: number; errors?: string[]; error?: string }>
  }

  // 服务端认证
  serverAuth: {
    login: () => Promise<{ success: boolean; user?: any; tokens?: any; error?: string }>
    logout: () => Promise<void>
    getUser: () => Promise<any | null>
    isLoggedIn: () => Promise<boolean>
    checkUserStatus: () => Promise<{ isApproved: boolean; status: string; message?: string }>
    refreshToken: () => Promise<{ success: boolean; tokens?: any; error?: string }>
    getAccessToken: () => Promise<string | null>
    getTokens: () => Promise<any | null>
    setServerUrl: (url: string) => Promise<void>
    getServerUrl: () => Promise<string>
    testConnection: (url?: string) => Promise<{ success: boolean; data?: any; error?: string }>
  }

  // 服务端同步
  serverSync: {
    sync: () => Promise<{ success: boolean; uploaded?: number; downloaded?: number; conflicts?: number; errors?: string[]; error?: string }>
    uploadProject: (projectId: string) => Promise<{ success: boolean; error?: string }>
    batchUpload: (projectIds: string[]) => Promise<{ success: boolean; uploaded?: number; errors?: string[]; error?: string }>
    restore: () => Promise<{ success: boolean; importedCount?: number; errors?: string[]; error?: string }>
  }

  // 服务端管理员
  serverAdmin: {
    listUsers: (params?: { status?: string; page?: number; limit?: number }) => Promise<{ success: boolean; users?: any[]; pagination?: any; error?: string }>
    getStats: () => Promise<{ success: boolean; stats?: any; error?: string }>
    approveUser: (userId: string) => Promise<{ success: boolean; user?: any; error?: string }>
    rejectUser: (userId: string, reason?: string) => Promise<{ success: boolean; user?: any; error?: string }>
    suspendUser: (userId: string, reason?: string) => Promise<{ success: boolean; user?: any; error?: string }>
    batchApprove: (userIds: string[]) => Promise<{ success: boolean; approved?: number; failed?: number; results?: any[]; error?: string }>
  }

  // 数据库操作
  db: {
    // 项目
    getProjects: () => Promise<any[]>
    getProject: (id: string) => Promise<any | null>
    createProject: (project: any) => Promise<any>
    updateProject: (id: string, data: any) => Promise<any>
    deleteProject: (id: string) => Promise<void>
    importProject: (data: any, options?: any) => Promise<{ success: boolean; projectId?: string; error?: string }>
    exportProject: (projectId: string) => Promise<any>

    // 卷
    getVolumes: (projectId: string) => Promise<any[]>
    createVolume: (volume: any) => Promise<any>
    updateVolume: (id: string, data: any) => Promise<any>
    deleteVolume: (id: string) => Promise<void>
    trySetGeneratingLock: (volumeId: string) => Promise<{ success: boolean; lockedAt?: number; lockedMinutesAgo?: number }>
    clearGeneratingLock: (volumeId: string) => Promise<void>
    checkGeneratingLock: (volumeId: string) => Promise<{ isLocked: boolean; lockedAt?: number; lockedMinutesAgo?: number }>

    // 章节
    getChapters: (volumeId: string) => Promise<any[]>
    getChapter: (id: string) => Promise<any | null>
    createChapter: (chapter: any) => Promise<any>
    createChaptersBatch: (chapters: any[]) => Promise<any[]>
    updateChapter: (id: string, data: any) => Promise<any>
    deleteChapter: (id: string) => Promise<void>

    // 角色
    getCharacters: (projectId: string) => Promise<any[]>
    getCharacter: (id: string) => Promise<any | null>
    createCharacter: (character: any) => Promise<any>
    updateCharacter: (id: string, data: any) => Promise<any>
    deleteCharacter: (id: string) => Promise<void>
  }

  // 设置
  settings: {
    get: (key: string) => Promise<any>
    set: (key: string, value: any) => Promise<void>
    getAll: () => Promise<Record<string, any>>
  }

  // 系统
  system: {
    getAppVersion: () => Promise<string>
    openExternal: (url: string) => void
  }

  // AI API 请求（通过主进程代理）
  ai: {
    fetch: (url: string, options: {
      method: string
      headers: Record<string, string>
      body?: string
    }) => Promise<{ ok: boolean; status: number; data: any; error?: string }>
  }
}

// 暴露 API 到渲染进程
const electronAPI: ElectronAPI = {
  window: {
    minimize: () => ipcRenderer.send('window:minimize'),
    maximize: () => ipcRenderer.send('window:maximize'),
    close: () => ipcRenderer.send('window:close')
  },

  auth: {
    login: () => ipcRenderer.invoke('auth:login'),
    logout: () => ipcRenderer.invoke('auth:logout'),
    getUser: () => ipcRenderer.invoke('auth:getUser'),
    isLoggedIn: () => ipcRenderer.invoke('auth:isLoggedIn')
  },

  drive: {
    sync: () => ipcRenderer.invoke('drive:sync'),
    upload: (data) => ipcRenderer.invoke('drive:upload', data),
    download: (fileId) => ipcRenderer.invoke('drive:download', fileId),
    list: () => ipcRenderer.invoke('drive:list'),
    restore: () => ipcRenderer.invoke('drive:restore')
  },

  serverAuth: {
    login: () => ipcRenderer.invoke('serverAuth:login'),
    logout: () => ipcRenderer.invoke('serverAuth:logout'),
    getUser: () => ipcRenderer.invoke('serverAuth:getUser'),
    isLoggedIn: () => ipcRenderer.invoke('serverAuth:isLoggedIn'),
    checkUserStatus: () => ipcRenderer.invoke('serverAuth:checkUserStatus'),
    refreshToken: () => ipcRenderer.invoke('serverAuth:refreshToken'),
    getAccessToken: () => ipcRenderer.invoke('serverAuth:getAccessToken'),
    getTokens: () => ipcRenderer.invoke('serverAuth:getTokens'),
    setServerUrl: (url) => ipcRenderer.invoke('serverAuth:setServerUrl', url),
    getServerUrl: () => ipcRenderer.invoke('serverAuth:getServerUrl'),
    testConnection: (url?: string) => ipcRenderer.invoke('serverAuth:testConnection', url)
  },

  serverSync: {
    sync: () => ipcRenderer.invoke('serverSync:sync'),
    uploadProject: (projectId) => ipcRenderer.invoke('serverSync:uploadProject', projectId),
    batchUpload: (projectIds) => ipcRenderer.invoke('serverSync:batchUpload', projectIds),
    restore: () => ipcRenderer.invoke('serverSync:restore')
  },

  serverAdmin: {
    listUsers: (params) => ipcRenderer.invoke('serverAdmin:listUsers', params),
    getStats: () => ipcRenderer.invoke('serverAdmin:getStats'),
    approveUser: (userId) => ipcRenderer.invoke('serverAdmin:approveUser', userId),
    rejectUser: (userId, reason) => ipcRenderer.invoke('serverAdmin:rejectUser', userId, reason),
    suspendUser: (userId, reason) => ipcRenderer.invoke('serverAdmin:suspendUser', userId, reason),
    batchApprove: (userIds) => ipcRenderer.invoke('serverAdmin:batchApprove', userIds)
  },

  db: {
    getProjects: () => ipcRenderer.invoke('db:getProjects'),
    getProject: (id) => ipcRenderer.invoke('db:getProject', id),
    createProject: (project) => ipcRenderer.invoke('db:createProject', project),
    updateProject: (id, data) => ipcRenderer.invoke('db:updateProject', id, data),
    deleteProject: (id) => ipcRenderer.invoke('db:deleteProject', id),
    importProject: (data, options) => ipcRenderer.invoke('db:importProject', data, options),
    exportProject: (projectId) => ipcRenderer.invoke('db:exportProject', projectId),

    getVolumes: (projectId) => ipcRenderer.invoke('db:getVolumes', projectId),
    createVolume: (volume) => ipcRenderer.invoke('db:createVolume', volume),
    updateVolume: (id, data) => ipcRenderer.invoke('db:updateVolume', id, data),
    deleteVolume: (id) => ipcRenderer.invoke('db:deleteVolume', id),
    trySetGeneratingLock: (volumeId) => ipcRenderer.invoke('db:trySetGeneratingLock', volumeId),
    clearGeneratingLock: (volumeId) => ipcRenderer.invoke('db:clearGeneratingLock', volumeId),
    checkGeneratingLock: (volumeId) => ipcRenderer.invoke('db:checkGeneratingLock', volumeId),

    getChapters: (volumeId) => ipcRenderer.invoke('db:getChapters', volumeId),
    getChapter: (id) => ipcRenderer.invoke('db:getChapter', id),
    createChapter: (chapter) => ipcRenderer.invoke('db:createChapter', chapter),
    createChaptersBatch: (chapters) => ipcRenderer.invoke('db:createChaptersBatch', chapters),
    updateChapter: (id, data) => ipcRenderer.invoke('db:updateChapter', id, data),
    deleteChapter: (id) => ipcRenderer.invoke('db:deleteChapter', id),

    getCharacters: (projectId) => ipcRenderer.invoke('db:getCharacters', projectId),
    getCharacter: (id) => ipcRenderer.invoke('db:getCharacter', id),
    createCharacter: (character) => ipcRenderer.invoke('db:createCharacter', character),
    updateCharacter: (id, data) => ipcRenderer.invoke('db:updateCharacter', id, data),
    deleteCharacter: (id) => ipcRenderer.invoke('db:deleteCharacter', id)
  },

  settings: {
    get: (key) => ipcRenderer.invoke('settings:get', key),
    set: (key, value) => ipcRenderer.invoke('settings:set', key, value),
    getAll: () => ipcRenderer.invoke('settings:getAll')
  },

  system: {
    getAppVersion: () => ipcRenderer.invoke('system:getAppVersion'),
    openExternal: (url) => ipcRenderer.send('system:openExternal', url)
  },

  ai: {
    fetch: (url, options) => ipcRenderer.invoke('ai:fetch', url, options)
  }
}

contextBridge.exposeInMainWorld('electron', electronAPI)

// 全局类型声明已在 src/types/index.ts 中定义
