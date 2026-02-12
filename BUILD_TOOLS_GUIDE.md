# better-sqlite3 编译问题解决方案

## ❓ 问题说明

`better-sqlite3` 是一个原生 Node.js 模块，需要 C++ 编译器才能安装。

你看到的错误是因为本地缺少 Windows 构建工具。

---

## 🎯 推荐方案：直接提交到 GitHub（最简单）

### 为什么推荐这个方案？

1. ✅ **GitHub Actions 已有完整构建工具**
   - Windows runner 预装了 Visual Studio Build Tools
   - macOS 和 Linux runner 也预装了编译器
   - 无需本地安装任何工具

2. ✅ **可以跳过本地测试**
   - 代码已经验证过（TypeScript 类型检查通过）
   - 依赖警告不影响构建
   - CI 会自动测试和构建

3. ✅ **节省时间**
   - 安装 Build Tools 需要 6GB+ 空间
   - 下载和安装需要 30+ 分钟
   - GitHub Actions 3-5 分钟完成构建

### 操作步骤

```bash
cd D:\code\story\novascribe-github

# 1. 提交修复（不需要 npm install）
git add package.json src/pages/Outline/index.tsx
git commit -m "fix: remove unused variable and update dependencies"

# 2. 推送到 GitHub
git push

# 3. 查看 GitHub Actions
# 访问：https://github.com/你的用户名/novascribe/actions
# 等待构建完成（约 5-15 分钟）
```

### 预期结果

GitHub Actions 会：
- ✅ 自动安装所有依赖（包括 better-sqlite3）
- ✅ 编译原生模块
- ✅ 构建应用
- ✅ 生成安装包

---

## 🔧 方案 2：本地完整安装（如果你需要本地开发）

### 步骤 1：安装 Windows Build Tools

#### 方法 A：使用 Chocolatey（推荐）

```powershell
# 以管理员身份运行 PowerShell

# 安装 Visual Studio Build Tools
choco install visualstudio2022buildtools --package-parameters "--add Microsoft.VisualStudio.Workload.VCTools --includeRecommended --includeOptional --passive"
```

#### 方法 B：手动安装

1. 访问：https://visualstudio.microsoft.com/downloads/
2. 下载 "Visual Studio 2022 Build Tools"
3. 运行安装程序
4. 选择 "Desktop development with C++"
5. 安装（约 6GB）

### 步骤 2：重新安装依赖

```bash
cd D:\code\story\novascribe-github

# 删除旧文件
rm -rf node_modules package-lock.json

# 重新安装
npm install
```

---

## 📊 两种方案对比

| 方案 | 优点 | 缺点 | 适用场景 |
|-----|------|------|---------|
| **方案 1: 直接提交** | • 快速<br>• 无需安装工具<br>• 节省空间 | • 无法本地调试 | • 只需上传代码<br>• 不做本地开发 |
| **方案 2: 本地安装** | • 可以本地开发<br>• 完整测试 | • 需要 6GB+ 空间<br>• 安装耗时 | • 需要本地开发<br>• 频繁修改代码 |

---

## ✅ 我的建议

### 如果你只是想上传到 GitHub：

**→ 使用方案 1**（直接提交）

理由：
- GitHub Actions 会自动处理一切
- 节省时间和空间
- 结果完全一样

### 如果你要继续开发这个项目：

**→ 使用方案 2**（安装 Build Tools）

理由：
- 可以本地运行和调试
- 更快的开发反馈循环
- 不依赖 CI 测试

---

## 🚀 快速决策

```bash
# 方案 1：直接提交（5 分钟）
cd D:\code\story\novascribe-github
git add .
git commit -m "fix: remove unused variable and update dependencies"
git push
# 然后查看 GitHub Actions

# 方案 2：本地安装（30+ 分钟）
# 1. 以管理员运行 PowerShell
choco install visualstudio2022buildtools --package-parameters "--add Microsoft.VisualStudio.Workload.VCTools"
# 2. 等待安装完成
# 3. 重新运行 npm install
```

---

## ❓ 常见问题

### Q: GitHub Actions 真的能成功编译吗？

A: **是的！** GitHub 的 Windows runner 预装了完整的 Visual Studio Build Tools。

验证：查看任何成功的 Electron 项目的 GitHub Actions 日志。

### Q: 本地不安装会影响 Git 提交吗？

A: **不会！** Git 只关心源代码，不关心 `node_modules`（已在 `.gitignore` 中排除）。

### Q: 如果 GitHub Actions 失败了怎么办？

A:
1. 查看构建日志找到具体错误
2. 修复代码
3. 重新提交
4. 不需要本地 Build Tools

### Q: 方案 1 提交后能下载安装包吗？

A: **可以！**
- Actions 完成后，可以下载 Artifacts
- 创建 tag 后，可以在 Release 下载

---

## 📝 总结

**对于你的情况（上传到 GitHub 并自动构建）：**

✅ **推荐：方案 1（直接提交）**

原因：
1. 你的主要目标是上传到 GitHub
2. GitHub Actions 会自动构建
3. 节省时间和空间
4. 结果完全一样

**行动计划**：
```bash
cd D:\code\story\novascribe-github
git add .
git commit -m "fix: remove unused variable and update dependencies"
git push
```

然后查看 GitHub Actions 页面，等待构建完成。

---

需要本地开发？查看"方案 2"安装 Build Tools。
