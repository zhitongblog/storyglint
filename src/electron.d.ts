// Electron API 类型定义
declare global {
  interface Window {
    electron: {
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
    }
  }
}

export {}
