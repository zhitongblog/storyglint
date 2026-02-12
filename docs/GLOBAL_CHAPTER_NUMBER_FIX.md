# 全局章节编号修复

## 问题描述

### 用户反馈
用户报告："你在生成内容时仍然没有自动的从全书的最开始去检查写到哪里了，例如我在第三卷的空白开始写，由于你把第三卷的第一章认为是第一章导致你从第三卷开始写了"

### 问题现象
- 当用户在第三卷开始自动写作时，系统显示"正在写作第 1/40 章"
- 实际应该显示"正在写作第 81/120 章"（假设前两卷共 80 章）
- 章节编号使用的是**卷内相对编号**而不是**全书绝对编号**

### 影响范围
- 自动写作进度显示不准确
- 用户无法清楚了解实际写作到全书的哪个位置
- 可能导致用户误解写作进度

---

## 根因分析

### 代码位置
文件：`src/services/chapter-writer.ts`
函数：`autoWriteAll()`

### 问题代码

```typescript
export async function autoWriteAll(
  chapters: Chapter[],
  startFromChapterId: string,
  onProgress: (data: AutoWriteProgress) => void,
  onComplete: (data: { successCount: number; failedCount: number }) => void,
  signal?: AbortSignal
) {
  // 1. 正确地对所有章节进行全局排序
  const sortedChapters = [...chapters].sort((a, b) => {
    if (a.volumeId !== b.volumeId) {
      return a.volumeId.localeCompare(b.volumeId)
    }
    return a.order - b.order
  })

  // 2. 找到开始位置的索引
  const startIndex = sortedChapters.findIndex(c => c.id === startFromChapterId)
  if (startIndex === -1) {
    throw new Error('开始章节未找到')
  }

  // 3. 获取待写作的章节列表
  const chaptersToWrite = sortedChapters.slice(startIndex)
  const totalChapters = chaptersToWrite.length // ❌ 问题：这里只计算了剩余章节数

  // 4. 遍历写作
  for (let i = 0; i < chaptersToWrite.length; i++) {
    const chapter = chaptersToWrite[i]
    const nextChapter = chaptersToWrite[i + 1]

    // ❌ 问题：使用局部索引 i + 1
    onProgress({
      currentChapter: i + 1,          // 从 1 开始计数（局部）
      totalChapters,                  // 只包含剩余章节
      chapterId: chapter.id,
      status: 'writing',
      message: `正在写作：${chapter.title}`
    })
  }
}
```

### 问题分析

#### 变量含义错误

| 变量 | 当前含义 | 应该含义 |
|------|---------|---------|
| `i + 1` | 在待写作列表中的相对位置（1, 2, 3...） | 在全书中的绝对位置（81, 82, 83...） |
| `totalChapters` | 剩余待写作章节数（40） | 全书总章节数（120） |

#### 示例场景

假设全书结构：
- 第一卷：40 章（章节 1-40）
- 第二卷：40 章（章节 41-80）
- 第三卷：40 章（章节 81-120）

当用户从第三卷第一章开始写作时：

| 实际情况 | 当前显示 | 应该显示 |
|---------|---------|---------|
| 全书第 81 章 | "正在写作第 1/40 章" | "正在写作第 81/120 章" |
| 全书第 82 章 | "正在写作第 2/40 章" | "正在写作第 82/120 章" |
| 全书第 120 章 | "正在写作第 40/40 章" | "正在写作第 120/120 章" |

---

## 解决方案

### 修复逻辑

#### 计算全局章节编号

```typescript
// ✅ 计算全局章节编号
const globalChapterNumber = startIndex + i + 1
```

**解释**：
- `startIndex`：开始章节在全局排序中的索引（例如第三卷第一章 = 索引 80）
- `i`：在待写作列表中的相对位置（0, 1, 2...）
- `startIndex + i + 1`：全局章节编号（81, 82, 83...）

#### 使用全书总章节数

```typescript
// ✅ 使用全书总章节数
totalChapters: sortedChapters.length
```

**解释**：
- `sortedChapters.length`：全书所有章节的数量（120）
- 而不是 `chaptersToWrite.length`（剩余章节数 40）

### 修复代码

```typescript
export async function autoWriteAll(
  chapters: Chapter[],
  startFromChapterId: string,
  onProgress: (data: AutoWriteProgress) => void,
  onComplete: (data: { successCount: number; failedCount: number }) => void,
  signal?: AbortSignal
) {
  const sortedChapters = [...chapters].sort((a, b) => {
    if (a.volumeId !== b.volumeId) {
      return a.volumeId.localeCompare(b.volumeId)
    }
    return a.order - b.order
  })

  const startIndex = sortedChapters.findIndex(c => c.id === startFromChapterId)
  if (startIndex === -1) {
    throw new Error('开始章节未找到')
  }

  const chaptersToWrite = sortedChapters.slice(startIndex)

  let successCount = 0
  let failedCount = 0

  for (let i = 0; i < chaptersToWrite.length; i++) {
    const chapter = chaptersToWrite[i]
    const nextChapter = chaptersToWrite[i + 1]

    // 🔥 计算全局章节编号（而不是局部索引）
    const globalChapterNumber = startIndex + i + 1

    // 检查信号
    if (signal?.aborted) {
      onProgress({
        currentChapter: globalChapterNumber,         // ✅ 使用全局编号
        totalChapters: sortedChapters.length,        // ✅ 使用全书总数
        chapterId: chapter.id,
        status: 'cancelled',
        message: '写作已取消'
      })
      break
    }

    // 跳过已有内容的章节
    if (chapter.content && chapter.content.trim().length > 500) {
      onProgress({
        currentChapter: globalChapterNumber,         // ✅ 使用全局编号
        totalChapters: sortedChapters.length,        // ✅ 使用全书总数
        chapterId: chapter.id,
        status: 'skipped',
        message: `跳过已有内容的章节：${chapter.title}`
      })
      continue
    }

    // 检查大纲
    if (!chapter.outline) {
      onProgress({
        currentChapter: globalChapterNumber,         // ✅ 使用全局编号
        totalChapters: sortedChapters.length,        // ✅ 使用全书总数
        chapterId: chapter.id,
        status: 'error',
        message: `章节缺少大纲：${chapter.title}`
      })
      failedCount++
      continue
    }

    try {
      // 写作中
      onProgress({
        currentChapter: globalChapterNumber,         // ✅ 使用全局编号
        totalChapters: sortedChapters.length,        // ✅ 使用全书总数
        chapterId: chapter.id,
        status: 'writing',
        message: `正在写作：${chapter.title}`
      })

      // 生成内容
      const content = await writeChapter(chapter, nextChapter?.outline, signal)

      // 保存内容
      onProgress({
        currentChapter: globalChapterNumber,         // ✅ 使用全局编号
        totalChapters: sortedChapters.length,        // ✅ 使用全书总数
        chapterId: chapter.id,
        status: 'saving',
        message: `正在保存：${chapter.title}`
      })

      await window.electron.db.updateChapter(chapter.id, {
        content,
        wordCount: content.length
      })

      successCount++

      // 成功
      onProgress({
        currentChapter: globalChapterNumber,         // ✅ 使用全局编号
        totalChapters: sortedChapters.length,        // ✅ 使用全书总数
        chapterId: chapter.id,
        status: 'completed',
        message: `完成：${chapter.title} (${content.length}字)`
      })

    } catch (error: any) {
      failedCount++
      onProgress({
        currentChapter: globalChapterNumber,         // ✅ 使用全局编号
        totalChapters: sortedChapters.length,        // ✅ 使用全书总数
        chapterId: chapter.id,
        status: 'error',
        message: `写作失败：${chapter.title} - ${error.message}`
      })
    }
  }

  onComplete({ successCount, failedCount })
}
```

### 修改位置统计

共修改了 **7 处** `onProgress` 调用：

1. ✅ 写作被取消时
2. ✅ 跳过已有内容时
3. ✅ 章节缺少大纲时
4. ✅ 开始写作时
5. ✅ 保存内容时
6. ✅ 写作成功时
7. ✅ 写作失败时

---

## 验证自动写作起始位置

### 代码位置
文件：`src/pages/Editor/index.tsx`
函数：`handleStartAutoWrite()`

### 验证结果：✅ 正确

```typescript
const handleStartAutoWrite = async () => {
  if (!currentChapter) {
    message.warning('请先选择一个章节')
    return
  }

  try {
    setAutoWriteStatus({ isRunning: true, currentChapter: 0, totalChapters: 0, message: '' })

    // ✅ 1. 对全书所有章节进行全局排序
    const sortedChapters = [...chapters].sort((a, b) => {
      if (a.volumeId !== b.volumeId) {
        return a.volumeId.localeCompare(b.volumeId)
      }
      return a.order - b.order
    })

    // ✅ 2. 找出所有未写作的章节（内容少于 500 字）
    const unwrittenChapters = sortedChapters.filter(
      c => !c.content || c.content.trim().length <= 500
    )

    if (unwrittenChapters.length === 0) {
      message.success('所有章节都已完成写作')
      setAutoWriteStatus({ isRunning: false, currentChapter: 0, totalChapters: 0, message: '' })
      return
    }

    // ✅ 3. 从第一个未写作的章节开始（全局第一个）
    const startChapter = unwrittenChapters[0]

    message.info({
      content: `即将从《${startChapter.title}》开始自动写作，共 ${unwrittenChapters.length} 章待写`,
      duration: 3
    })

    // ... 其余代码
  } catch (error: any) {
    // ... 错误处理
  }
}
```

### 结论

用户担心的"是否会从第一个没写的章节续写"问题：

- ✅ **已经正确实现**
- 系统会对全书所有章节进行全局排序
- 找出所有未写作的章节（`content.length <= 500`）
- 从第一个未写作的章节开始（`unwrittenChapters[0]`）

**不会**出现"跳过前面未写章节，从当前卷开始写"的情况。

---

## 修复效果

### 修复前

```
正在写作第 1/40 章
正在写作第 2/40 章
...
正在写作第 40/40 章
```

❌ 问题：
- 无法知道全书实际进度
- 看起来只有 40 章要写
- 不知道从全书的哪个位置开始

### 修复后

```
正在写作第 81/120 章
正在写作第 82/120 章
...
正在写作第 120/120 章
```

✅ 优点：
- 清晰显示全书绝对位置
- 准确显示全书总章节数
- 用户一眼就能看出写作进度（还剩多少章）

---

## 测试建议

### 测试场景 1：从第三卷开始写作

**前置条件**：
- 第一卷：40 章，全部已写完
- 第二卷：40 章，全部已写完
- 第三卷：40 章，全部未写

**操作步骤**：
1. 打开第三卷第一章
2. 点击"自动写作"按钮
3. 观察进度提示

**预期结果**：
- 进度显示："正在写作第 81/120 章"
- 而不是："正在写作第 1/40 章"

### 测试场景 2：从中间章节续写

**前置条件**：
- 第一卷：40 章，全部已写完
- 第二卷：40 章，前 20 章已写，后 20 章未写
- 第三卷：40 章，全部未写

**操作步骤**：
1. 打开任意章节
2. 点击"自动写作"按钮
3. 观察进度提示

**预期结果**：
- 自动从第二卷第 21 章开始（全书第 61 章）
- 进度显示："正在写作第 61/120 章"
- 而不是从第三卷开始

### 测试场景 3：跳过已写章节

**前置条件**：
- 第一卷：40 章，第 1-10、21-30 已写，其余未写
- 点击第 15 章，开始自动写作

**操作步骤**：
1. 观察进度跳转

**预期结果**：
- 写第 11 章时：显示 "11/120"
- 跳过第 21-30 章
- 写第 31 章时：显示 "31/120"

---

## 相关文件

### 修改文件
- `src/services/chapter-writer.ts` - 修复章节编号计算逻辑

### 验证文件（无需修改）
- `src/pages/Editor/index.tsx` - 确认自动写作起始逻辑正确

---

## 总结

### 问题本质
- 混淆了"局部相对编号"和"全局绝对编号"
- 混淆了"剩余章节数"和"全书总章节数"

### 修复原则
- 所有涉及章节编号的地方，必须使用全局绝对编号
- 所有涉及总数的地方，必须使用全书总章节数

### 影响范围
- 仅影响进度显示，不影响实际写作逻辑
- 写作起始位置逻辑本身是正确的，无需修改

### 修复难度
- ⭐⭐☆☆☆（简单）
- 仅需在一个文件中添加一行计算代码
- 将 7 处 `onProgress` 调用参数修改为正确的全局值
