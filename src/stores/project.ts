import { create } from 'zustand'
import type { Project, Volume, Chapter, Character } from '../types'

interface ProjectState {
  // 项目列表
  projects: Project[]
  currentProject: Project | null

  // 卷
  volumes: Volume[]
  currentVolume: Volume | null

  // 章节
  chapters: Chapter[]
  currentChapter: Chapter | null

  // 角色
  characters: Character[]
  currentCharacter: Character | null

  // 加载状态
  isLoading: boolean
  error: string | null

  // 生成状态（用于导航守卫）
  isGenerating: boolean
  setGenerating: (value: boolean) => void

  // 项目操作
  loadProjects: () => Promise<void>
  loadProject: (id: string) => Promise<void>
  createProject: (data: Partial<Project>) => Promise<Project | null>
  updateProject: (id: string, data: Partial<Project>) => Promise<void>
  deleteProject: (id: string) => Promise<void>
  setCurrentProject: (project: Project | null) => void

  // 卷操作
  loadVolumes: (projectId: string) => Promise<void>
  createVolume: (data: Partial<Volume>) => Promise<Volume | null>
  updateVolume: (id: string, data: Partial<Volume>) => Promise<void>
  deleteVolume: (id: string) => Promise<void>
  setCurrentVolume: (volume: Volume | null) => void

  // 章节操作
  loadChapters: (volumeId: string) => Promise<void>
  loadAllChapters: (projectId: string) => Promise<void>  // 新增：加载所有卷的章节
  loadChapter: (id: string) => Promise<void>
  createChapter: (data: Partial<Chapter>) => Promise<Chapter | null>
  updateChapter: (id: string, data: Partial<Chapter>) => Promise<void>
  deleteChapter: (id: string) => Promise<void>
  setCurrentChapter: (chapter: Chapter | null) => void

  // 角色操作
  loadCharacters: (projectId: string) => Promise<void>
  createCharacter: (data: Partial<Character>) => Promise<Character | null>
  updateCharacter: (id: string, data: Partial<Character>) => Promise<void>
  deleteCharacter: (id: string) => Promise<void>
  setCurrentCharacter: (character: Character | null) => void

  // 清除错误
  clearError: () => void
}

export const useProjectStore = create<ProjectState>((set, get) => ({
  projects: [],
  currentProject: null,
  volumes: [],
  currentVolume: null,
  chapters: [],
  currentChapter: null,
  characters: [],
  currentCharacter: null,
  isLoading: false,
  error: null,
  isGenerating: false,

  setGenerating: (value: boolean) => set({ isGenerating: value }),

  // ==================== 项目操作 ====================

  loadProjects: async () => {
    // Check if electron API is available
    if (!window.electron?.db) {
      console.warn('Electron db API not available')
      set({ projects: [], isLoading: false })
      return
    }

    set({ isLoading: true, error: null })
    try {
      const projects = await window.electron.db.getProjects()
      set({ projects, isLoading: false })
    } catch (error: any) {
      console.error('Load projects failed:', error)
      set({ error: error.message, isLoading: false })
    }
  },

  loadProject: async (id: string) => {
    console.log('📖 [Store] 开始加载项目:', id)

    // 清除之前项目的所有状态（修复切换项目时显示旧数据的问题）
    set({
      isLoading: true,
      error: null,
      currentVolume: null,
      currentChapter: null,
      volumes: [],
      chapters: [],
      characters: []
    })

    try {
      const project = await window.electron.db.getProject(id)
      if (project) {
        console.log('✅ [Store] 项目加载成功:', project.title)
        set({ currentProject: project, isLoading: false })
        // 同时加载卷和角色
        await get().loadVolumes(id)
        await get().loadCharacters(id)
        console.log('🎉 [Store] 项目完整数据加载完成')
      } else {
        console.error('❌ [Store] 项目不存在')
        set({ error: '项目不存在', isLoading: false })
      }
    } catch (error: any) {
      console.error('❌ [Store] 加载项目失败:', error)
      set({ error: error.message, isLoading: false })
    }
  },

  createProject: async (data: Partial<Project>) => {
    set({ isLoading: true, error: null })
    try {
      const project = await window.electron.db.createProject(data)
      const projects = [...get().projects, project]
      set({ projects, currentProject: project, isLoading: false })
      return project
    } catch (error: any) {
      set({ error: error.message, isLoading: false })
      return null
    }
  },

  updateProject: async (id: string, data: Partial<Project>) => {
    try {
      const project = await window.electron.db.updateProject(id, data)
      const projects = get().projects.map((p) => (p.id === id ? project : p))
      set({ projects, currentProject: project })
    } catch (error: any) {
      set({ error: error.message })
    }
  },

  deleteProject: async (id: string) => {
    try {
      await window.electron.db.deleteProject(id)
      const projects = get().projects.filter((p) => p.id !== id)
      set({
        projects,
        currentProject: get().currentProject?.id === id ? null : get().currentProject
      })
    } catch (error: any) {
      set({ error: error.message })
    }
  },

  setCurrentProject: (project) => set({ currentProject: project }),

  // ==================== 卷操作 ====================

  loadVolumes: async (projectId: string) => {
    try {
      console.log('📦 [Store] 开始加载卷列表...')
      const volumes = await window.electron.db.getVolumes(projectId)
      console.log(`📦 [Store] 加载到 ${volumes.length} 卷`)
      set({ volumes })

      // 自动加载所有卷的章节
      if (volumes.length > 0) {
        set({ currentVolume: volumes[0] })
        console.log('📄 [Store] 开始加载所有卷的章节...')
        await get().loadAllChapters(projectId)
        console.log('✅ [Store] 所有章节加载完成')
      }
    } catch (error: any) {
      console.error('❌ [Store] 加载卷失败:', error)
      set({ error: error.message })
    }
  },

  createVolume: async (data: Partial<Volume>) => {
    try {
      const volume = await window.electron.db.createVolume(data)
      const volumes = [...get().volumes, volume]
      set({ volumes, currentVolume: volume })
      return volume
    } catch (error: any) {
      set({ error: error.message })
      return null
    }
  },

  updateVolume: async (id: string, data: Partial<Volume>) => {
    try {
      const volume = await window.electron.db.updateVolume(id, data)
      const volumes = get().volumes.map((v) => (v.id === id ? volume : v))
      set({ volumes, currentVolume: volume })
    } catch (error: any) {
      set({ error: error.message })
    }
  },

  deleteVolume: async (id: string) => {
    try {
      await window.electron.db.deleteVolume(id)
      const volumes = get().volumes.filter((v) => v.id !== id)
      set({
        volumes,
        currentVolume: get().currentVolume?.id === id ? null : get().currentVolume
      })
    } catch (error: any) {
      set({ error: error.message })
    }
  },

  setCurrentVolume: (volume) => set({ currentVolume: volume }),

  // ==================== 章节操作 ====================

  loadChapters: async (volumeId: string) => {
    try {
      const chapters = await window.electron.db.getChapters(volumeId)
      set({ chapters })
    } catch (error: any) {
      set({ error: error.message })
    }
  },

  // 加载项目所有卷的所有章节（避免只加载单卷导致其他卷章节消失）
  loadAllChapters: async (projectId: string) => {
    try {
      const volumes = get().volumes.length > 0
        ? get().volumes
        : await window.electron.db.getVolumes(projectId)

      let allChapters: Chapter[] = []
      for (const volume of volumes) {
        const volChapters = await window.electron.db.getChapters(volume.id)
        allChapters = [...allChapters, ...volChapters]
      }

      // 按照 volumeId 和 order 排序
      allChapters.sort((a, b) => {
        const volA = volumes.findIndex(v => v.id === a.volumeId)
        const volB = volumes.findIndex(v => v.id === b.volumeId)
        if (volA !== volB) return volA - volB
        return a.order - b.order
      })

      set({ chapters: allChapters })
      console.log(`✅ Loaded ${allChapters.length} chapters from ${volumes.length} volumes`)
    } catch (error: any) {
      console.error('❌ Failed to load all chapters:', error)
      set({ error: error.message })
    }
  },

  loadChapter: async (id: string) => {
    try {
      const chapter = await window.electron.db.getChapter(id)
      if (chapter) {
        set({ currentChapter: chapter })
      }
    } catch (error: any) {
      set({ error: error.message })
    }
  },

  createChapter: async (data: Partial<Chapter>) => {
    try {
      const chapter = await window.electron.db.createChapter(data)
      const chapters = [...get().chapters, chapter]
      set({ chapters, currentChapter: chapter })
      return chapter
    } catch (error: any) {
      set({ error: error.message })
      return null
    }
  },

  updateChapter: async (id: string, data: Partial<Chapter>) => {
    try {
      const chapter = await window.electron.db.updateChapter(id, data)
      const chapters = get().chapters.map((c) => (c.id === id ? chapter : c))
      set({ chapters, currentChapter: chapter })
    } catch (error: any) {
      set({ error: error.message })
    }
  },

  deleteChapter: async (id: string) => {
    try {
      await window.electron.db.deleteChapter(id)
      const chapters = get().chapters.filter((c) => c.id !== id)
      set({
        chapters,
        currentChapter: get().currentChapter?.id === id ? null : get().currentChapter
      })
    } catch (error: any) {
      set({ error: error.message })
    }
  },

  setCurrentChapter: (chapter) => set({ currentChapter: chapter }),

  // ==================== 角色操作 ====================

  loadCharacters: async (projectId: string) => {
    try {
      const characters = await window.electron.db.getCharacters(projectId)
      set({ characters })
    } catch (error: any) {
      set({ error: error.message })
    }
  },

  createCharacter: async (data: Partial<Character>) => {
    try {
      const character = await window.electron.db.createCharacter(data)
      const characters = [...get().characters, character]
      set({ characters, currentCharacter: character })
      return character
    } catch (error: any) {
      set({ error: error.message })
      return null
    }
  },

  updateCharacter: async (id: string, data: Partial<Character>) => {
    try {
      const character = await window.electron.db.updateCharacter(id, data)
      const characters = get().characters.map((c) => (c.id === id ? character : c))
      set({ characters, currentCharacter: character })
    } catch (error: any) {
      set({ error: error.message })
    }
  },

  deleteCharacter: async (id: string) => {
    try {
      await window.electron.db.deleteCharacter(id)
      const characters = get().characters.filter((c) => c.id !== id)
      set({
        characters,
        currentCharacter: get().currentCharacter?.id === id ? null : get().currentCharacter
      })
    } catch (error: any) {
      set({ error: error.message })
    }
  },

  setCurrentCharacter: (character) => set({ currentCharacter: character }),

  clearError: () => set({ error: null })
}))
