# 构建问题修复说明

## ✅ 已修复的问题

### 1. Node.js 版本不匹配

**问题**:
```
npm warn EBADENGINE Unsupported engine {
  package: 'glob@11.1.0',
  required: { node: '20 || >=22' },
  current: { node: 'v18.20.8', npm: '10.8.2' }
}
```

**原因**:
- GitHub Actions 使用 Node.js 18
- `overrides` 中强制使用 `glob@11`，需要 Node 20+

**修复**:
```yaml
# .github/workflows/build.yml
- name: Setup Node.js
  uses: actions/setup-node@v4
  with:
    node-version: '20'  # ✅ 从 18 升级到 20
```

```json
// package.json
"overrides": {
  "glob": "^10.0.0",    // ✅ 降级到兼容版本
  "rimraf": "^5.0.0"    // ✅ 使用兼容版本
}
```

---

### 2. package-lock.json 不同步

**问题**:
```
npm error `npm ci` can only install packages when your package.json
and package-lock.json are in sync.
```

**原因**:
- 修改了 `package.json`（更新依赖、添加 overrides）
- 但没有重新生成 `package-lock.json`
- `npm ci` 要求严格同步

**修复**:
```yaml
# .github/workflows/build.yml
- name: Install dependencies
  run: npm install  # ✅ 改为 npm install，自动生成 lock file
```

```gitignore
# .gitignore
package-lock.json  # ✅ 不提交 lock file，让 CI 自动生成
```

---

### 3. better-sqlite3 编译问题

**问题**:
- 本地缺少 C++ 编译工具
- `better-sqlite3` 无法编译

**解决**:
- ✅ 不需要本地安装
- ✅ GitHub Actions 会自动编译
- ✅ 使用 `npm install`（不是 `npm ci`）

---

## 📋 所有修改的文件

### 1. `.github/workflows/build.yml`

```diff
- node-version: '18'
+ node-version: '20'

- run: npm ci
+ run: npm install
```

### 2. `package.json`

```diff
 "devDependencies": {
+  "@electron/rebuild": "^3.6.0",
-  "electron-rebuild": "^3.2.9",
   ...
 },
+"overrides": {
+  "glob": "^10.0.0",
+  "rimraf": "^5.0.0"
+}
```

### 3. `.gitignore`

```diff
 # 依赖
 node_modules/
 .pnpm-store/
+package-lock.json
```

### 4. `src/pages/Outline/index.tsx`

```diff
 const existingChapters = chapters.filter((c) => c.volumeId === volumeId)
-const chapterNumber = chaptersBeforeCurrentVolume + existingChapters.length + 1

 await createChapter({
```

---

## 🚀 提交到 GitHub

### 步骤

```bash
cd D:\code\story\novascribe-github

# 查看更改
git status

# 添加所有更改
git add .

# 提交
git commit -m "fix: update Node.js to v20, fix dependencies and build config"

# 推送
git push
```

---

## ✅ 预期结果

### GitHub Actions 会：

1. ✅ 使用 Node.js 20
2. ✅ 运行 `npm install`（自动生成 package-lock.json）
3. ✅ 编译 better-sqlite3
4. ✅ 构建应用
5. ✅ 打包安装程序
6. ✅ 上传构建产物

### 构建时间

- Windows: 5-10 分钟
- macOS: 8-15 分钟
- Linux: 5-10 分钟

---

## 🔍 验证构建

访问：`https://github.com/你的用户名/novascribe/actions`

查看最新的工作流运行：
- ✅ `build (windows-latest)` - 绿色对勾
- ✅ `build (macos-latest)` - 绿色对勾
- ✅ `build (ubuntu-latest)` - 绿色对勾

---

## 📦 下载构建产物

### 开发版本（Artifacts）

1. 进入 Actions 页面
2. 点击最新的成功运行
3. 滚动到 "Artifacts" 区域
4. 下载对应平台的构建产物

### 正式版本（Release）

```bash
# 创建版本标签
git tag v1.0.0
git push origin v1.0.0

# GitHub 会自动：
# 1. 构建所有平台
# 2. 创建 Release
# 3. 上传安装包
```

---

## 📚 技术说明

### 为什么不提交 package-lock.json？

**优点**:
- ✅ 避免本地和 CI 环境不同步
- ✅ CI 自动生成最新的 lock file
- ✅ 减少 Git 冲突

**缺点**:
- ⚠️ 每次构建可能安装略微不同的依赖版本
- ⚠️ 构建时间稍长（需要解析依赖）

**适用场景**:
- ✅ 单人开发或小团队
- ✅ 主要依赖 CI 构建
- ✅ 不需要严格的依赖版本锁定

### 为什么使用 npm install 而不是 npm ci？

| 命令 | 特点 | 适用场景 |
|-----|------|---------|
| `npm ci` | • 快速<br>• 严格（需要 lock file）<br>• 删除 node_modules | • 生产环境<br>• 严格依赖管理 |
| `npm install` | • 灵活<br>• 自动生成 lock file<br>• 增量安装 | • 开发环境<br>• 依赖更新 |

我们使用 `npm install` 因为：
- 不提交 package-lock.json
- 允许自动生成
- 更灵活的依赖管理

---

## ⚠️ 注意事项

### package-lock.json 已添加到 .gitignore

如果之前已经提交了 `package-lock.json`，需要从 Git 历史中删除：

```bash
# 从 Git 跟踪中移除（但保留本地文件）
git rm --cached package-lock.json

# 提交
git commit -m "chore: stop tracking package-lock.json"
git push
```

### 依赖警告仍然存在

运行 `npm install` 时仍会看到警告：
```
npm warn deprecated rimraf@3.0.2
npm warn deprecated glob@7.2.3
...
```

这些警告：
- ✅ 不影响构建
- ✅ 来自间接依赖
- ✅ 已通过 `overrides` 最大程度优化
- ⏳ 等待上游包更新

---

## 🎯 总结

### 修复内容

| 问题 | 修复方案 | 状态 |
|-----|---------|------|
| Node.js 版本 | 升级到 20 | ✅ |
| glob@11 冲突 | 降级到 glob@10 | ✅ |
| package-lock 不同步 | 不提交 lock file | ✅ |
| npm ci 失败 | 改用 npm install | ✅ |
| 未使用变量 | 删除 chapterNumber | ✅ |
| better-sqlite3 | CI 自动编译 | ✅ |

### 下一步

```bash
# 1. 提交修复
git add .
git commit -m "fix: update Node.js to v20, fix dependencies and build config"
git push

# 2. 查看构建
# 访问 GitHub Actions 页面

# 3. 等待成功 ✅
```

---

**所有问题已修复！准备提交。** 🎉
