# GitHub Actions 构建失败诊断

## 📋 错误信息

```
The strategy configuration was canceled because "build.ubuntu-latest" failed
```

**含义**：Ubuntu 平台构建失败，导致 Windows 和 macOS 构建也被取消。

---

## 🔍 查看详细错误日志

### 方法 1：通过 GitHub 网页查看

1. 访问 GitHub Actions 页面：
   ```
   https://github.com/zhitongblog/novascribe-github/actions
   ```

2. 点击最新的失败运行（红色 ❌）

3. 展开 "build (ubuntu-latest)" 任务

4. 查看具体失败的步骤：
   - ❌ Setup Node.js
   - ❌ Install dependencies
   - ❌ Build application
   - ❌ Package application

5. 点击失败的步骤，查看完整日志

6. **复制完整错误日志**发给我

---

### 方法 2：使用 gh CLI（如果已安装）

```bash
# 查看最新的工作流运行
gh run list --limit 5

# 查看具体运行的日志（替换 RUN_ID）
gh run view RUN_ID --log

# 查看失败的任务
gh run view RUN_ID --log-failed
```

---

## 🎯 常见错误和解决方案

### 错误 1：better-sqlite3 编译失败

**错误信息**：
```
error: node-gyp rebuild failed
gyp ERR! build error
gyp ERR! stack Error: `make` failed with exit code: 2
```

**原因**：Ubuntu 缺少 C++ 编译工具

**解决方案**：
在 `.github/workflows/build.yml` 中添加构建工具安装：

```yaml
- name: Install build dependencies (Ubuntu)
  if: matrix.os == 'ubuntu-latest'
  run: |
    sudo apt-get update
    sudo apt-get install -y build-essential python3
```

---

### 错误 2：npm install 失败

**错误信息**：
```
npm ERR! code ERESOLVE
npm ERR! ERESOLVE unable to resolve dependency tree
```

**原因**：依赖冲突

**解决方案**：
在 `.github/workflows/build.yml` 中使用 `--legacy-peer-deps`：

```yaml
- name: Install dependencies
  run: npm install --legacy-peer-deps
```

---

### 错误 3：TypeScript 编译错误

**错误信息**：
```
error TS2xxx: ...
```

**原因**：代码有类型错误

**解决方案**：
在本地运行检查：

```bash
cd D:\code\story\novascribe-github
npm run build
```

如果本地也失败，说明代码有问题，需要修复。

---

### 错误 4：内存不足

**错误信息**：
```
FATAL ERROR: Reached heap limit Allocation failed
```

**原因**：构建过程内存不足

**解决方案**：
在 `.github/workflows/build.yml` 中增加内存限制：

```yaml
- name: Build application
  run: NODE_OPTIONS="--max-old-space-size=4096" npm run build
```

---

## 🔧 快速修复步骤

### 如果是 better-sqlite3 问题（最可能）

1. **修改 `.github/workflows/build.yml`**：

```yaml
jobs:
  build:
    strategy:
      matrix:
        os: [windows-latest, macos-latest, ubuntu-latest]
    runs-on: ${{ matrix.os }}

    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      # 🔥 新增：安装构建工具（Ubuntu）
      - name: Install build dependencies (Ubuntu)
        if: matrix.os == 'ubuntu-latest'
        run: |
          sudo apt-get update
          sudo apt-get install -y build-essential python3

      - name: Install dependencies
        run: npm install

      - name: Build application
        run: npm run build

      - name: Package application (Windows)
        if: matrix.os == 'windows-latest'
        run: npm run build:win

      # ... 其他步骤 ...
```

2. **提交并推送**：

```bash
cd D:\code\story\novascribe-github
git add .github/workflows/build.yml
git commit -m "fix: add build dependencies for Ubuntu"
git push
```

---

### 如果是代码问题

1. **本地测试构建**：

```bash
cd D:\code\story\novascribe-github
npm install
npm run build
```

2. **如果本地失败，检查错误**：
   - TypeScript 错误 → 修复代码
   - 依赖问题 → 检查 package.json
   - 路径问题 → 检查 import 语句

3. **修复后重新推送**

---

## 📊 诊断清单

请按顺序检查：

- [ ] 查看 GitHub Actions 详细日志
- [ ] 确认具体是哪个步骤失败
- [ ] 复制完整错误信息
- [ ] 本地运行 `npm run build` 测试
- [ ] 检查是否是 better-sqlite3 编译问题
- [ ] 检查是否是依赖冲突
- [ ] 检查是否是 TypeScript 错误

---

## 🆘 需要的信息

请提供以下信息，我可以更准确地诊断：

1. **完整错误日志**（从 GitHub Actions 复制）
2. **失败的步骤名称**（例如：Install dependencies）
3. **本地 `npm run build` 是否成功**

---

## 💡 临时方案

如果急需构建，可以：

1. **只在 Windows 上构建**：

   修改 `.github/workflows/build.yml`：
   ```yaml
   strategy:
     matrix:
       os: [windows-latest]  # 只保留 Windows
   ```

2. **本地构建**：

   ```bash
   cd D:\code\story\novascribe
   npm run build
   npm run build:win
   ```

   生成的安装包在 `dist/` 目录。

---

**请提供详细的错误日志，我会帮你快速解决！** 🚀
