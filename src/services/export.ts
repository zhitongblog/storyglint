import JSZip from 'jszip'
import { saveAs } from 'file-saver'
import { formatToTxt } from './chapter-writer'

interface ChapterData {
  id: string
  title: string
  content: string
  order: number
}

interface VolumeData {
  id: string
  title: string
  order: number
}

/**
 * 清理文件名，移除不允许的字符
 */
function sanitizeFileName(name: string): string {
  return name.replace(/[<>:"/\\|?*]/g, '_').trim()
}

/**
 * 清理标题中已有的章节编号前缀（处理历史遗留数据）
 */
function cleanChapterTitle(title: string): string {
  // 移除 "第X章 " 或 "第X章" 前缀
  return title.replace(/^第\d+章\s*/, '').trim() || title
}

/**
 * 构建完整的章节标题（带编号）
 * 例如: title="开端", order=1 -> "第1章 开端"
 */
function buildChapterTitle(title: string, order: number): string {
  return `第${order}章 ${cleanChapterTitle(title)}`
}

/**
 * 导出单个卷的所有章节为 ZIP
 * @param volumeTitle 卷标题
 * @param chapters 章节数据（需要包含全书编号信息）
 * @param startGlobalChapterNumber 该卷起始的全书章节编号（必须提供，用于统一文件名格式）
 */
export async function exportVolumeAsZip(
  volumeTitle: string,
  chapters: ChapterData[],
  startGlobalChapterNumber: number
): Promise<void> {
  if (chapters.length === 0) {
    throw new Error('该卷没有章节可导出')
  }

  const zip = new JSZip()
  const sortedChapters = [...chapters].sort((a, b) => a.order - b.order)

  // 只对有内容的章节进行编号，确保导出的章节编号连续
  let exportedChapterCount = 0
  for (const chapter of sortedChapters) {
    if (!chapter.content || chapter.content.trim().length === 0) {
      continue // 跳过空章节，不增加编号
    }

    // 使用连续的全书编号（只计算有内容的章节）
    const globalNum = startGlobalChapterNumber + exportedChapterCount
    const chapterTitle = buildChapterTitle(chapter.title, globalNum)
    const fileName = sanitizeFileName(`${chapterTitle}.txt`)

    // 格式化内容为 TXT（不包含章节标题，只有正文）
    const content = formatToTxt(chapter.content)

    zip.file(fileName, content)
    exportedChapterCount++
  }

  // 检查是否有文件被添加
  if (Object.keys(zip.files).length === 0) {
    throw new Error('没有可导出的章节内容')
  }

  const zipBlob = await zip.generateAsync({ type: 'blob' })
  const zipFileName = sanitizeFileName(`${volumeTitle}.zip`)
  saveAs(zipBlob, zipFileName)
}

/**
 * 导出全书所有章节为 ZIP
 */
export async function exportBookAsZip(
  bookTitle: string,
  volumes: VolumeData[],
  chaptersByVolume: Map<string, ChapterData[]>
): Promise<void> {
  const zip = new JSZip()
  const sortedVolumes = [...volumes].sort((a, b) => a.order - b.order)

  let hasContent = false
  // 只对有内容的章节进行编号，确保导出的章节编号连续
  let globalChapterNum = 0

  for (const volume of sortedVolumes) {
    const chapters = chaptersByVolume.get(volume.id) || []
    const sortedChapters = [...chapters].sort((a, b) => a.order - b.order)

    // 创建卷文件夹
    const volumeFolder = sanitizeFileName(volume.title)

    for (const chapter of sortedChapters) {
      if (!chapter.content || chapter.content.trim().length === 0) {
        continue // 跳过空章节，不增加编号
      }

      // 使用连续的全书编号（只计算有内容的章节）
      globalChapterNum++
      const chapterTitle = buildChapterTitle(chapter.title, globalChapterNum)
      const fileName = sanitizeFileName(`${chapterTitle}.txt`)

      // 格式化内容为 TXT（不包含章节标题，只有正文）
      const content = formatToTxt(chapter.content)

      zip.file(`${volumeFolder}/${fileName}`, content)
      hasContent = true
    }
  }

  if (!hasContent) {
    throw new Error('没有可导出的章节内容')
  }

  const zipBlob = await zip.generateAsync({ type: 'blob' })
  const zipFileName = sanitizeFileName(`${bookTitle}_全书.zip`)
  saveAs(zipBlob, zipFileName)
}

/**
 * 导出全书为单层 ZIP（不分卷文件夹）
 */
export async function exportBookAsFlatZip(
  bookTitle: string,
  volumes: VolumeData[],
  chaptersByVolume: Map<string, ChapterData[]>
): Promise<void> {
  const zip = new JSZip()
  const sortedVolumes = [...volumes].sort((a, b) => a.order - b.order)

  let hasContent = false
  let globalChapterNum = 0

  for (const volume of sortedVolumes) {
    const chapters = chaptersByVolume.get(volume.id) || []
    const sortedChapters = [...chapters].sort((a, b) => a.order - b.order)

    for (const chapter of sortedChapters) {
      if (!chapter.content || chapter.content.trim().length === 0) {
        globalChapterNum++
        continue // 跳过空章节
      }

      globalChapterNum++
      const chapterTitle = buildChapterTitle(chapter.title, globalChapterNum)
      const fileName = sanitizeFileName(`${chapterTitle}.txt`)

      // 格式化内容为 TXT（不包含章节标题，只有正文）
      const content = formatToTxt(chapter.content)

      zip.file(fileName, content)
      hasContent = true
    }
  }

  if (!hasContent) {
    throw new Error('没有可导出的章节内容')
  }

  const zipBlob = await zip.generateAsync({ type: 'blob' })
  const zipFileName = sanitizeFileName(`${bookTitle}.zip`)
  saveAs(zipBlob, zipFileName)
}
