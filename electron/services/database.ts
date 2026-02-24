import Database from 'better-sqlite3'
import { app } from 'electron'
import path from 'path'
import crypto from 'crypto'

// 使用 Node.js 原生 crypto 模块生成 UUID
const uuidv4 = () => crypto.randomUUID()

export class DatabaseService {
  private db: Database.Database | null = null
  private dbPath: string
  private userDataPath: string

  constructor() {
    this.userDataPath = app.getPath('userData')
    this.dbPath = path.join(this.userDataPath, 'storyglint.db')
  }

  /**
   * 迁移旧数据库文件（从 novascribe.db 到 storyglint.db）
   * 这确保用户升级后数据不会丢失
   */
  private migrateOldDatabase(): void {
    const fs = require('fs')
    const oldDbPath = path.join(this.userDataPath, 'novascribe.db')
    const newDbPath = this.dbPath

    // 检查是否需要迁移：旧文件存在且新文件不存在
    if (fs.existsSync(oldDbPath) && !fs.existsSync(newDbPath)) {
      console.log('[Database] 检测到旧数据库文件，正在迁移...')

      try {
        // 重命名主数据库文件
        fs.renameSync(oldDbPath, newDbPath)
        console.log('[Database] 主数据库文件迁移成功')

        // 迁移 WAL 模式相关文件（如果存在）
        const walFiles = ['-shm', '-wal']
        for (const suffix of walFiles) {
          const oldWalPath = oldDbPath + suffix
          const newWalPath = newDbPath + suffix
          if (fs.existsSync(oldWalPath)) {
            fs.renameSync(oldWalPath, newWalPath)
            console.log(`[Database] ${suffix} 文件迁移成功`)
          }
        }

        console.log('[Database] 数据库迁移完成: novascribe.db -> storyglint.db')
      } catch (error) {
        console.error('[Database] 数据库迁移失败:', error)
        // 迁移失败不应该阻止程序运行，新用户会创建新数据库
      }
    }
  }

  /**
   * 初始化数据库
   */
  async initialize(): Promise<void> {
    // 先尝试迁移旧数据库
    this.migrateOldDatabase()

    this.db = new Database(this.dbPath)
    this.db.pragma('journal_mode = WAL')

    this.createTables()
  }

  /**
   * 创建数据表
   */
  private createTables(): void {
    if (!this.db) return

    // 项目表
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS projects (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        inspiration TEXT,
        constraints TEXT,
        scale TEXT DEFAULT 'million',
        genres TEXT DEFAULT '[]',
        styles TEXT DEFAULT '[]',
        world_setting TEXT,
        summary TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
        synced_at TEXT
      )
    `)

    // 卷表
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS volumes (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        title TEXT NOT NULL,
        summary TEXT,
        sort_order INTEGER DEFAULT 0,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
      )
    `)

    // 迁移：为volumes表添加新字段（优化大纲一致性）
    try {
      this.db.exec(`ALTER TABLE volumes ADD COLUMN key_points TEXT DEFAULT '[]'`)
    } catch { /* 字段已存在 */ }
    try {
      this.db.exec(`ALTER TABLE volumes ADD COLUMN brief_chapters TEXT DEFAULT '[]'`)
    } catch { /* 字段已存在 */ }
    // 迁移：添加生成锁字段（防止重复生成）
    try {
      this.db.exec(`ALTER TABLE volumes ADD COLUMN generating_lock INTEGER DEFAULT 0`)
    } catch { /* 字段已存在 */ }
    // 迁移：添加主线剧情和关键事件字段（防止章节与卷大纲冲突）
    try {
      this.db.exec(`ALTER TABLE volumes ADD COLUMN main_plot TEXT DEFAULT ''`)
    } catch { /* 字段已存在 */ }
    try {
      this.db.exec(`ALTER TABLE volumes ADD COLUMN key_events TEXT DEFAULT '[]'`)
    } catch { /* 字段已存在 */ }

    // 章节表
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS chapters (
        id TEXT PRIMARY KEY,
        volume_id TEXT NOT NULL,
        title TEXT NOT NULL,
        outline TEXT,
        content TEXT,
        word_count INTEGER DEFAULT 0,
        sort_order INTEGER DEFAULT 0,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (volume_id) REFERENCES volumes(id) ON DELETE CASCADE
      )
    `)

    // 角色表
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS characters (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        name TEXT NOT NULL,
        role TEXT DEFAULT 'supporting',
        gender TEXT,
        age TEXT,
        identity TEXT,
        description TEXT,
        arc TEXT,
        status TEXT DEFAULT 'pending',
        death_chapter TEXT,
        appearances TEXT DEFAULT '[]',
        relationships TEXT DEFAULT '[]',
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
      )
    `)

    // 迁移：为旧表添加新字段
    try {
      this.db.exec(`ALTER TABLE characters ADD COLUMN death_chapter TEXT`)
    } catch { /* 字段已存在 */ }
    try {
      this.db.exec(`ALTER TABLE characters ADD COLUMN relationships TEXT DEFAULT '[]'`)
    } catch { /* 字段已存在 */ }

    // 设置表
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT
      )
    `)

    // 删除记录表（用于同步时追踪已删除的项目）
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS deleted_projects (
        id TEXT PRIMARY KEY,
        title TEXT,
        deleted_at TEXT DEFAULT CURRENT_TIMESTAMP,
        synced INTEGER DEFAULT 0
      )
    `)

    // 创建索引
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_volumes_project ON volumes(project_id);
      CREATE INDEX IF NOT EXISTS idx_chapters_volume ON chapters(volume_id);
      CREATE INDEX IF NOT EXISTS idx_characters_project ON characters(project_id);
      CREATE INDEX IF NOT EXISTS idx_deleted_projects_synced ON deleted_projects(synced);
    `)
  }

  // ==================== 项目操作 ====================

  getProjects(): any[] {
    const stmt = this.db!.prepare(`
      SELECT * FROM projects ORDER BY updated_at DESC
    `)
    return stmt.all().map(this.parseProjectRow)
  }

  getProject(id: string): any | null {
    const stmt = this.db!.prepare('SELECT * FROM projects WHERE id = ?')
    const row = stmt.get(id)
    return row ? this.parseProjectRow(row) : null
  }

  createProject(data: any): any {
    const id = uuidv4()
    const now = new Date().toISOString()

    const stmt = this.db!.prepare(`
      INSERT INTO projects (id, title, inspiration, constraints, scale, genres, styles, world_setting, summary, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)

    stmt.run(
      id,
      data.title || '未命名作品',
      data.inspiration || '',
      data.constraints || '',
      data.scale || 'million',
      JSON.stringify(data.genres || []),
      JSON.stringify(data.styles || []),
      data.worldSetting || '',
      data.summary || '',
      now,
      now
    )

    return this.getProject(id)
  }

  updateProject(id: string, data: any): any {
    const now = new Date().toISOString()
    const updates: string[] = []
    const values: any[] = []

    const fieldMap: Record<string, string> = {
      title: 'title',
      inspiration: 'inspiration',
      constraints: 'constraints',
      scale: 'scale',
      genres: 'genres',
      styles: 'styles',
      worldSetting: 'world_setting',
      summary: 'summary'
    }

    for (const [key, column] of Object.entries(fieldMap)) {
      if (data[key] !== undefined) {
        updates.push(`${column} = ?`)
        if (key === 'genres' || key === 'styles') {
          values.push(JSON.stringify(data[key]))
        } else {
          values.push(data[key])
        }
      }
    }

    if (updates.length > 0) {
      updates.push('updated_at = ?')
      values.push(now, id)

      const stmt = this.db!.prepare(`
        UPDATE projects SET ${updates.join(', ')} WHERE id = ?
      `)
      stmt.run(...values)
    }

    return this.getProject(id)
  }

  deleteProject(id: string): void {
    // 获取项目标题用于记录
    const project = this.getProject(id)
    const title = project?.title || '未知项目'

    // 记录到删除表（用于同步时同步删除服务端数据）
    const recordStmt = this.db!.prepare(`
      INSERT OR REPLACE INTO deleted_projects (id, title, deleted_at, synced)
      VALUES (?, ?, ?, 0)
    `)
    recordStmt.run(id, title, new Date().toISOString())

    // 删除项目
    const stmt = this.db!.prepare('DELETE FROM projects WHERE id = ?')
    stmt.run(id)
  }

  /**
   * 获取未同步的删除记录
   */
  getUnsyncedDeletions(): Array<{ id: string; title: string; deletedAt: string }> {
    const stmt = this.db!.prepare(`
      SELECT id, title, deleted_at as deletedAt FROM deleted_projects WHERE synced = 0
    `)
    return stmt.all() as any[]
  }

  /**
   * 标记删除记录为已同步
   */
  markDeletionSynced(id: string): void {
    const stmt = this.db!.prepare(`
      UPDATE deleted_projects SET synced = 1 WHERE id = ?
    `)
    stmt.run(id)
  }

  /**
   * 检查项目是否在删除记录中
   */
  isProjectDeleted(id: string): boolean {
    const stmt = this.db!.prepare(`
      SELECT 1 FROM deleted_projects WHERE id = ?
    `)
    return !!stmt.get(id)
  }

  /**
   * 从删除记录中移除（用于恢复项目时）
   */
  removeFromDeletedProjects(id: string): void {
    const stmt = this.db!.prepare(`
      DELETE FROM deleted_projects WHERE id = ?
    `)
    stmt.run(id)
  }

  /**
   * 清理已同步的删除记录（保留最近30天的记录）
   */
  cleanupOldDeletions(): void {
    const thirtyDaysAgo = new Date()
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

    const stmt = this.db!.prepare(`
      DELETE FROM deleted_projects WHERE synced = 1 AND deleted_at < ?
    `)
    stmt.run(thirtyDaysAgo.toISOString())
  }

  private parseProjectRow(row: any): any {
    return {
      id: row.id,
      title: row.title,
      inspiration: row.inspiration,
      constraints: row.constraints,
      scale: row.scale,
      genres: JSON.parse(row.genres || '[]'),
      styles: JSON.parse(row.styles || '[]'),
      worldSetting: row.world_setting,
      summary: row.summary,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      syncedAt: row.synced_at
    }
  }

  // ==================== 卷操作 ====================

  getVolumes(projectId: string): any[] {
    const stmt = this.db!.prepare(`
      SELECT * FROM volumes WHERE project_id = ? ORDER BY sort_order ASC
    `)
    return stmt.all(projectId).map(this.parseVolumeRow)
  }

  createVolume(data: any): any {
    const id = uuidv4()
    const now = new Date().toISOString()

    // 获取当前最大排序值
    const maxOrder = this.db!.prepare(
      'SELECT MAX(sort_order) as max FROM volumes WHERE project_id = ?'
    ).get(data.projectId) as any
    const sortOrder = (maxOrder?.max || 0) + 1

    const stmt = this.db!.prepare(`
      INSERT INTO volumes (id, project_id, title, summary, sort_order, key_points, brief_chapters, main_plot, key_events, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)

    stmt.run(
      id,
      data.projectId,
      data.title || '第一卷',
      data.summary || '',
      sortOrder,
      JSON.stringify(data.keyPoints || []),
      JSON.stringify(data.briefChapters || []),
      data.mainPlot || '',
      JSON.stringify(data.keyEvents || []),
      now,
      now
    )

    return this.getVolume(id)
  }

  getVolume(id: string): any | null {
    const stmt = this.db!.prepare('SELECT * FROM volumes WHERE id = ?')
    const row = stmt.get(id)
    return row ? this.parseVolumeRow(row) : null
  }

  updateVolume(id: string, data: any): any {
    const now = new Date().toISOString()
    const updates: string[] = []
    const values: any[] = []

    if (data.title !== undefined) {
      updates.push('title = ?')
      values.push(data.title)
    }
    if (data.summary !== undefined) {
      updates.push('summary = ?')
      values.push(data.summary)
    }
    if (data.order !== undefined) {
      updates.push('sort_order = ?')
      values.push(data.order)
    }
    if (data.keyPoints !== undefined) {
      updates.push('key_points = ?')
      values.push(JSON.stringify(data.keyPoints))
    }
    if (data.briefChapters !== undefined) {
      updates.push('brief_chapters = ?')
      values.push(JSON.stringify(data.briefChapters))
    }
    if (data.mainPlot !== undefined) {
      updates.push('main_plot = ?')
      values.push(data.mainPlot)
    }
    if (data.keyEvents !== undefined) {
      updates.push('key_events = ?')
      values.push(JSON.stringify(data.keyEvents))
    }

    if (updates.length > 0) {
      updates.push('updated_at = ?')
      values.push(now, id)

      const stmt = this.db!.prepare(`
        UPDATE volumes SET ${updates.join(', ')} WHERE id = ?
      `)
      stmt.run(...values)
    }

    return this.getVolume(id)
  }

  deleteVolume(id: string): void {
    const stmt = this.db!.prepare('DELETE FROM volumes WHERE id = ?')
    stmt.run(id)
  }

  /**
   * 尝试设置生成锁
   * @returns true 如果成功获取锁，false 如果锁已被占用
   */
  trySetGeneratingLock(volumeId: string): { success: boolean; lockedAt?: number; lockedMinutesAgo?: number } {
    const now = Date.now()
    const fiveMinutesAgo = now - 5 * 60 * 1000 // 5分钟超时

    // 先检查是否有有效的锁
    const checkStmt = this.db!.prepare(`
      SELECT generating_lock FROM volumes WHERE id = ?
    `)
    const row: any = checkStmt.get(volumeId)

    if (row && row.generating_lock > fiveMinutesAgo) {
      // 锁仍然有效（5分钟内）
      const minutesAgo = Math.floor((now - row.generating_lock) / (60 * 1000))
      return {
        success: false,
        lockedAt: row.generating_lock,
        lockedMinutesAgo: minutesAgo
      }
    }

    // 锁已过期或不存在，设置新锁
    const updateStmt = this.db!.prepare(`
      UPDATE volumes SET generating_lock = ? WHERE id = ?
    `)
    updateStmt.run(now, volumeId)

    return { success: true }
  }

  /**
   * 清除生成锁
   */
  clearGeneratingLock(volumeId: string): void {
    const stmt = this.db!.prepare(`
      UPDATE volumes SET generating_lock = 0 WHERE id = ?
    `)
    stmt.run(volumeId)
  }

  /**
   * 检查是否有生成锁
   */
  checkGeneratingLock(volumeId: string): { isLocked: boolean; lockedAt?: number; lockedMinutesAgo?: number } {
    const now = Date.now()
    const fiveMinutesAgo = now - 5 * 60 * 1000

    const stmt = this.db!.prepare(`
      SELECT generating_lock FROM volumes WHERE id = ?
    `)
    const row: any = stmt.get(volumeId)

    if (row && row.generating_lock > fiveMinutesAgo) {
      const minutesAgo = Math.floor((now - row.generating_lock) / (60 * 1000))
      return {
        isLocked: true,
        lockedAt: row.generating_lock,
        lockedMinutesAgo: minutesAgo
      }
    }

    return { isLocked: false }
  }

  private parseVolumeRow(row: any): any {
    return {
      id: row.id,
      projectId: row.project_id,
      title: row.title,
      summary: row.summary,
      order: row.sort_order,
      keyPoints: row.key_points ? JSON.parse(row.key_points) : [],
      briefChapters: row.brief_chapters ? JSON.parse(row.brief_chapters) : [],
      mainPlot: row.main_plot || '',
      keyEvents: row.key_events ? JSON.parse(row.key_events) : [],
      generatingLock: row.generating_lock || 0,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    }
  }

  // ==================== 章节操作 ====================

  getChapters(volumeId: string): any[] {
    const stmt = this.db!.prepare(`
      SELECT * FROM chapters WHERE volume_id = ? ORDER BY sort_order ASC
    `)
    return stmt.all(volumeId).map(this.parseChapterRow)
  }

  getChapter(id: string): any | null {
    const stmt = this.db!.prepare('SELECT * FROM chapters WHERE id = ?')
    const row = stmt.get(id)
    return row ? this.parseChapterRow(row) : null
  }

  createChapter(data: any): any {
    const id = uuidv4()
    const now = new Date().toISOString()

    // 支持显式传递 order 值，避免并发时计算出相同的序号
    let sortOrder: number
    if (data.order !== undefined && data.order !== null) {
      sortOrder = data.order
    } else {
      // 使用事务确保原子性：获取 MAX 并插入
      const maxOrder = this.db!.prepare(
        'SELECT MAX(sort_order) as max FROM chapters WHERE volume_id = ?'
      ).get(data.volumeId) as any
      sortOrder = (maxOrder?.max || 0) + 1
    }

    const stmt = this.db!.prepare(`
      INSERT INTO chapters (id, volume_id, title, outline, content, word_count, sort_order, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)

    const content = data.content || ''
    const wordCount = content.replace(/\s/g, '').length

    stmt.run(
      id,
      data.volumeId,
      data.title || '第一章',
      data.outline || '',
      content,
      wordCount,
      sortOrder,
      now,
      now
    )

    return this.getChapter(id)
  }

  /**
   * 批量创建章节（使用事务确保原子性，防止并发时序号重复）
   */
  createChaptersBatch(chaptersData: any[]): any[] {
    if (!chaptersData.length) return []

    const volumeId = chaptersData[0].volumeId
    const now = new Date().toISOString()

    // 获取当前最大序号
    const maxOrder = this.db!.prepare(
      'SELECT MAX(sort_order) as max FROM chapters WHERE volume_id = ?'
    ).get(volumeId) as any
    let currentOrder = (maxOrder?.max || 0)

    const insertStmt = this.db!.prepare(`
      INSERT INTO chapters (id, volume_id, title, outline, content, word_count, sort_order, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)

    const createdIds: string[] = []

    // 使用事务批量插入
    const insertAll = this.db!.transaction(() => {
      for (const data of chaptersData) {
        const id = uuidv4()
        currentOrder++
        const content = data.content || ''
        const wordCount = content.replace(/\s/g, '').length

        insertStmt.run(
          id,
          data.volumeId,
          data.title || '第一章',
          data.outline || '',
          content,
          wordCount,
          currentOrder,
          now,
          now
        )
        createdIds.push(id)
      }
    })

    insertAll()

    // 返回创建的章节
    return createdIds.map(id => this.getChapter(id))
  }

  updateChapter(id: string, data: any): any {
    const now = new Date().toISOString()
    const updates: string[] = []
    const values: any[] = []

    if (data.title !== undefined) {
      updates.push('title = ?')
      values.push(data.title)
    }
    if (data.outline !== undefined) {
      updates.push('outline = ?')
      values.push(data.outline)
    }
    if (data.content !== undefined) {
      updates.push('content = ?')
      values.push(data.content)
      updates.push('word_count = ?')
      values.push(data.content.replace(/\s/g, '').length)
    }
    if (data.order !== undefined) {
      updates.push('sort_order = ?')
      values.push(data.order)
    }

    if (updates.length > 0) {
      updates.push('updated_at = ?')
      values.push(now, id)

      const stmt = this.db!.prepare(`
        UPDATE chapters SET ${updates.join(', ')} WHERE id = ?
      `)
      stmt.run(...values)
    }

    return this.getChapter(id)
  }

  deleteChapter(id: string): void {
    const stmt = this.db!.prepare('DELETE FROM chapters WHERE id = ?')
    stmt.run(id)
  }

  private parseChapterRow(row: any): any {
    return {
      id: row.id,
      volumeId: row.volume_id,
      title: row.title,
      outline: row.outline,
      content: row.content,
      wordCount: row.word_count,
      order: row.sort_order,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    }
  }

  // ==================== 角色操作 ====================

  getCharacters(projectId: string): any[] {
    const stmt = this.db!.prepare(`
      SELECT * FROM characters WHERE project_id = ? ORDER BY created_at DESC
    `)
    return stmt.all(projectId).map(this.parseCharacterRow)
  }

  getCharacter(id: string): any | null {
    const stmt = this.db!.prepare('SELECT * FROM characters WHERE id = ?')
    const row = stmt.get(id)
    return row ? this.parseCharacterRow(row) : null
  }

  createCharacter(data: any): any {
    const id = uuidv4()
    const now = new Date().toISOString()

    const stmt = this.db!.prepare(`
      INSERT INTO characters (id, project_id, name, role, gender, age, identity, description, arc, status, death_chapter, appearances, relationships, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)

    stmt.run(
      id,
      data.projectId,
      data.name || '未命名角色',
      data.role || 'supporting',
      data.gender || '',
      data.age || '',
      data.identity || '',
      data.description || '',
      data.arc || '',
      data.status || 'pending',
      data.deathChapter || '',
      JSON.stringify(data.appearances || []),
      JSON.stringify(data.relationships || []),
      now,
      now
    )

    return this.getCharacter(id)
  }

  updateCharacter(id: string, data: any): any {
    const now = new Date().toISOString()
    const updates: string[] = []
    const values: any[] = []

    const fields = ['name', 'role', 'gender', 'age', 'identity', 'description', 'arc', 'status']
    for (const field of fields) {
      if (data[field] !== undefined) {
        updates.push(`${field} = ?`)
        values.push(data[field])
      }
    }

    if (data.deathChapter !== undefined) {
      updates.push('death_chapter = ?')
      values.push(data.deathChapter)
    }

    if (data.appearances !== undefined) {
      updates.push('appearances = ?')
      values.push(JSON.stringify(data.appearances))
    }

    if (data.relationships !== undefined) {
      updates.push('relationships = ?')
      values.push(JSON.stringify(data.relationships))
    }

    if (updates.length > 0) {
      updates.push('updated_at = ?')
      values.push(now, id)

      const stmt = this.db!.prepare(`
        UPDATE characters SET ${updates.join(', ')} WHERE id = ?
      `)
      stmt.run(...values)
    }

    return this.getCharacter(id)
  }

  deleteCharacter(id: string): void {
    const stmt = this.db!.prepare('DELETE FROM characters WHERE id = ?')
    stmt.run(id)
  }

  private parseCharacterRow(row: any): any {
    return {
      id: row.id,
      projectId: row.project_id,
      name: row.name,
      role: row.role,
      gender: row.gender,
      age: row.age,
      identity: row.identity,
      description: row.description,
      arc: row.arc,
      status: row.status,
      deathChapter: row.death_chapter || '',
      appearances: JSON.parse(row.appearances || '[]'),
      relationships: JSON.parse(row.relationships || '[]'),
      createdAt: row.created_at,
      updatedAt: row.updated_at
    }
  }

  // ==================== 设置操作 ====================

  getSetting(key: string): any {
    const stmt = this.db!.prepare('SELECT value FROM settings WHERE key = ?')
    const row = stmt.get(key) as any
    return row ? JSON.parse(row.value) : null
  }

  setSetting(key: string, value: any): void {
    const stmt = this.db!.prepare(`
      INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)
    `)
    stmt.run(key, JSON.stringify(value))
  }

  getAllSettings(): Record<string, any> {
    const stmt = this.db!.prepare('SELECT * FROM settings')
    const rows = stmt.all() as any[]
    const settings: Record<string, any> = {}
    for (const row of rows) {
      settings[row.key] = JSON.parse(row.value)
    }
    return settings
  }

  // ==================== 导出数据 ====================

  exportProjectData(projectId: string): any {
    const project = this.getProject(projectId)
    if (!project) return null

    const volumes = this.getVolumes(projectId)
    const chapters: any[] = []
    for (const volume of volumes) {
      const volumeChapters = this.getChapters(volume.id)
      chapters.push(...volumeChapters)
    }
    const characters = this.getCharacters(projectId)

    return {
      project,
      volumes,
      chapters,
      characters,
      exportedAt: new Date().toISOString()
    }
  }

  /**
   * 导入项目数据
   * @param data 包含 project, volumes, chapters, characters 的完整数据
   * @param options 导入选项
   * @returns 导入的项目ID
   */
  importProjectData(
    data: any,
    options: {
      overwrite?: boolean // 如果项目已存在，是否覆盖
      generateNewIds?: boolean // 是否生成新的ID（避免冲突）
    } = {}
  ): { success: boolean; projectId?: string; error?: string } {
    const { overwrite = false, generateNewIds = true } = options

    try {
      if (!data.project) {
        return { success: false, error: '缺少项目数据' }
      }

      const now = new Date().toISOString()

      // ID 映射表（用于关联关系）
      const idMap = {
        project: data.project.id,
        volumes: new Map<string, string>(),
        chapters: new Map<string, string>()
      }

      // 1. 检查项目是否已存在
      const existingProject = this.getProject(data.project.id)
      if (existingProject && !overwrite && !generateNewIds) {
        return { success: false, error: '项目已存在，使用不同的导入选项' }
      }

      // 2. 导入项目
      let projectId: string
      if (existingProject && overwrite) {
        // 覆盖模式：删除旧数据
        this.deleteProject(data.project.id)
        projectId = data.project.id
      } else if (generateNewIds) {
        // 生成新ID模式
        projectId = uuidv4()
        idMap.project = projectId
      } else {
        projectId = data.project.id
      }

      // 创建项目
      const stmt = this.db!.prepare(`
        INSERT INTO projects (id, title, inspiration, constraints, scale, genres, styles, world_setting, summary, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)

      stmt.run(
        projectId,
        data.project.title || '未命名作品',
        data.project.inspiration || '',
        data.project.constraints || '',
        data.project.scale || 'million',
        JSON.stringify(data.project.genres || []),
        JSON.stringify(data.project.styles || []),
        data.project.worldSetting || '',
        data.project.summary || '',
        data.project.createdAt || now,
        now
      )

      // 3. 导入卷
      if (data.volumes && Array.isArray(data.volumes)) {
        for (const volume of data.volumes) {
          const volumeId = generateNewIds ? uuidv4() : volume.id
          idMap.volumes.set(volume.id, volumeId)

          const volumeStmt = this.db!.prepare(`
            INSERT INTO volumes (id, project_id, title, summary, sort_order, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
          `)

          volumeStmt.run(
            volumeId,
            projectId,
            volume.title || '第一卷',
            volume.summary || '',
            volume.order || 0,
            volume.createdAt || now,
            now
          )
        }
      }

      // 4. 导入章节
      if (data.chapters && Array.isArray(data.chapters)) {
        for (const chapter of data.chapters) {
          const chapterId = generateNewIds ? uuidv4() : chapter.id
          const volumeId = idMap.volumes.get(chapter.volumeId) || chapter.volumeId

          idMap.chapters.set(chapter.id, chapterId)

          const content = chapter.content || ''
          const wordCount = content.replace(/\s/g, '').length

          const chapterStmt = this.db!.prepare(`
            INSERT INTO chapters (id, volume_id, title, outline, content, word_count, sort_order, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
          `)

          chapterStmt.run(
            chapterId,
            volumeId,
            chapter.title || '未命名',
            chapter.outline || '',
            content,
            wordCount,
            chapter.order || 0,
            chapter.createdAt || now,
            now
          )
        }
      }

      // 5. 导入角色
      if (data.characters && Array.isArray(data.characters)) {
        for (const char of data.characters) {
          const charId = generateNewIds ? uuidv4() : char.id

          // 更新 appearances 中的章节ID引用
          let appearances = char.appearances || []
          if (generateNewIds && Array.isArray(appearances)) {
            appearances = appearances.map((chapterId: string) =>
              idMap.chapters.get(chapterId) || chapterId
            )
          }

          const charStmt = this.db!.prepare(`
            INSERT INTO characters (id, project_id, name, role, gender, age, identity, description, arc, status, death_chapter, appearances, relationships, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `)

          charStmt.run(
            charId,
            projectId,
            char.name || '未命名角色',
            char.role || 'supporting',
            char.gender || '',
            char.age || '',
            char.identity || '',
            char.description || '',
            char.arc || '',
            char.status || 'pending',
            char.deathChapter || '',
            JSON.stringify(appearances),
            JSON.stringify(char.relationships || []),
            char.createdAt || now,
            now
          )
        }
      }

      return { success: true, projectId }

    } catch (error: any) {
      console.error('Import error:', error)
      return { success: false, error: error.message }
    }
  }

  /**
   * 关闭数据库连接
   */
  close(): void {
    if (this.db) {
      this.db.close()
      this.db = null
    }
  }

  // ==================== 同步辅助方法 ====================

  /**
   * 创建或更新项目（用于同步）
   * 保留原有ID
   */
  createOrUpdateProject(data: any): any {
    const existing = this.getProject(data.id)
    if (existing) {
      return this.updateProject(data.id, data)
    }

    const now = new Date().toISOString()
    const stmt = this.db!.prepare(`
      INSERT INTO projects (id, title, inspiration, constraints, scale, genres, styles, world_setting, summary, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)

    stmt.run(
      data.id,
      data.title || '未命名作品',
      data.inspiration || '',
      data.constraints || '',
      data.scale || 'million',
      JSON.stringify(data.genres || []),
      JSON.stringify(data.styles || []),
      data.worldSetting || '',
      data.summary || '',
      data.createdAt || now,
      data.updatedAt || now
    )

    return this.getProject(data.id)
  }

  /**
   * 创建或更新卷（用于同步）
   * 保留原有ID
   */
  createOrUpdateVolume(data: any): any {
    const existing = this.getVolume(data.id)
    if (existing) {
      return this.updateVolume(data.id, data)
    }

    const now = new Date().toISOString()
    const stmt = this.db!.prepare(`
      INSERT INTO volumes (id, project_id, title, summary, sort_order, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `)

    stmt.run(
      data.id,
      data.projectId,
      data.title || '第一卷',
      data.summary || '',
      data.order || 0,
      data.createdAt || now,
      data.updatedAt || now
    )

    return this.getVolume(data.id)
  }

  /**
   * 创建或更新章节（用于同步）
   * 保留原有ID
   */
  createOrUpdateChapter(data: any): any {
    const existing = this.getChapter(data.id)
    if (existing) {
      return this.updateChapter(data.id, data)
    }

    const now = new Date().toISOString()
    const content = data.content || ''
    const wordCount = content.replace(/\s/g, '').length

    const stmt = this.db!.prepare(`
      INSERT INTO chapters (id, volume_id, title, outline, content, word_count, sort_order, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)

    stmt.run(
      data.id,
      data.volumeId,
      data.title || '第一章',
      data.outline || '',
      content,
      wordCount,
      data.order || 0,
      data.createdAt || now,
      data.updatedAt || now
    )

    return this.getChapter(data.id)
  }

  /**
   * 创建或更新角色（用于同步）
   * 保留原有ID
   */
  createOrUpdateCharacter(data: any): any {
    const existing = this.getCharacter(data.id)
    if (existing) {
      return this.updateCharacter(data.id, data)
    }

    const now = new Date().toISOString()
    const stmt = this.db!.prepare(`
      INSERT INTO characters (id, project_id, name, role, gender, age, identity, description, arc, status, death_chapter, appearances, relationships, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)

    stmt.run(
      data.id,
      data.projectId,
      data.name || '未命名角色',
      data.role || 'supporting',
      data.gender || '',
      data.age || '',
      data.identity || '',
      data.description || '',
      data.arc || '',
      data.status || 'pending',
      data.deathChapter || '',
      JSON.stringify(data.appearances || []),
      JSON.stringify(data.relationships || []),
      data.createdAt || now,
      data.updatedAt || now
    )

    return this.getCharacter(data.id)
  }
}
