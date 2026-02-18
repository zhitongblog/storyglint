import { app, BrowserWindow, ipcMain, shell, safeStorage, session } from 'electron'
import path from 'path'
import Store from 'electron-store'
import { setupIpcHandlers } from './ipc/handlers'
import { GoogleAuthService } from './services/google-auth'
import { GoogleDriveService } from './services/google-drive'
import { ServerAuthService } from './services/server-auth'
import { ServerSyncService } from './services/server-sync'
import { ServerAdminService } from './services/server-admin'
import { DatabaseService } from './services/database'

// 环境变量
const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged

// 设置存储
const store = new Store({
  name: 'novascribe-settings'
})

let mainWindow: BrowserWindow | null = null
let googleAuth: GoogleAuthService
let googleDrive: GoogleDriveService
let serverAuth: ServerAuthService
let serverSync: ServerSyncService
let serverAdmin: ServerAdminService
let database: DatabaseService

async function setupProxy() {
  try {
    // 读取代理配置
    const proxyEnabled = store.get('proxyEnabled', false) as boolean
    const proxyUrl = store.get('proxyUrl', '') as string

    console.log('[Main] 代理配置 - 启用:', proxyEnabled, '地址:', proxyUrl || '(使用系统代理)')

    if (proxyEnabled && proxyUrl) {
      // 使用手动配置的代理
      console.log('[Main] 配置手动代理:', proxyUrl)

      // 解析代理 URL 并转换为 Electron 代理规则格式
      let proxyRules = proxyUrl

      try {
        // 如果是完整的 URL 格式，转换为 Electron 代理规则
        if (proxyUrl.startsWith('http://') || proxyUrl.startsWith('https://')) {
          const url = new URL(proxyUrl)
          // 格式: http=host:port;https=host:port
          proxyRules = `http=${url.host};https=${url.host}`
        } else if (proxyUrl.startsWith('socks5://') || proxyUrl.startsWith('socks://')) {
          const url = new URL(proxyUrl)
          // 格式: socks5://host:port
          proxyRules = `socks5://${url.host}`
        }
        // 如果已经是 host:port 格式，直接使用
      } catch (e) {
        console.warn('[Main] 代理 URL 解析失败，直接使用:', proxyUrl)
      }

      console.log('[Main] 转换后的代理规则:', proxyRules)

      await session.defaultSession.setProxy({
        proxyRules: proxyRules,
        proxyBypassRules: 'localhost,127.0.0.1,<local>'
      })
      console.log('[Main] 代理配置成功')
    } else if (proxyEnabled && !proxyUrl) {
      // 使用系统代理
      console.log('[Main] 使用系统代理')
      await session.defaultSession.setProxy({
        mode: 'system'
      })
      console.log('[Main] 系统代理已启用')
    } else {
      // 不使用代理
      console.log('[Main] 代理未启用，直连')
      await session.defaultSession.setProxy({
        mode: 'direct'
      })
    }
  } catch (error) {
    console.error('[Main] 代理配置失败:', error)
  }
}

async function createWindow() {
  // 配置代理（在创建窗口前）
  await setupProxy()

  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 700,
    frame: false,
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: '#1a1a2e',
      symbolColor: '#ffffff',
      height: 40
    },
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false // 需要访问 better-sqlite3
    },
    icon: path.join(__dirname, '../assets/icon.ico'),
    backgroundColor: '#1a1a2e',
    show: false
  })

  // 窗口准备好后显示，避免白屏
  mainWindow.once('ready-to-show', () => {
    mainWindow?.show()
  })

  // 处理外部链接
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173')
    mainWindow.webContents.openDevTools()
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
  }

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

async function initServices() {
  // 初始化数据库
  database = new DatabaseService()
  await database.initialize()

  // 初始化 Google 认证服务
  googleAuth = new GoogleAuthService()

  // 初始化 Google Drive 服务
  googleDrive = new GoogleDriveService(googleAuth)

  // 初始化服务端认证服务
  serverAuth = new ServerAuthService()

  // 初始化服务端同步服务
  serverSync = new ServerSyncService(serverAuth, database)

  // 初始化服务端管理员服务
  serverAdmin = new ServerAdminService(serverAuth)

  // 设置 IPC 处理程序
  setupIpcHandlers(ipcMain, {
    mainWindow: () => mainWindow,
    googleAuth,
    googleDrive,
    serverAuth,
    serverSync,
    serverAdmin,
    database,
    safeStorage
  })
}

// 应用就绪
app.whenReady().then(async () => {
  await initServices()
  await createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

// 窗口全部关闭时退出（macOS 除外）
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// 安全性设置
app.on('web-contents-created', (_, contents) => {
  contents.on('will-navigate', (event, navigationUrl) => {
    const parsedUrl = new URL(navigationUrl)
    if (!['localhost', '127.0.0.1'].includes(parsedUrl.hostname) && parsedUrl.protocol !== 'file:') {
      event.preventDefault()
    }
  })
})
