@echo off
echo ======================================
echo   NovaScribe 依赖安装
echo ======================================
echo.

REM 检查是否在正确的目录
if not exist "package.json" (
  echo ❌ 错误：未找到 package.json
  echo 请在项目根目录运行此脚本
  pause
  exit /b 1
)

echo 📦 清理旧依赖...
if exist "node_modules" rmdir /s /q node_modules 2>nul
if exist "package-lock.json" del /q package-lock.json 2>nul

echo.
echo 📥 安装依赖（可能会看到警告，这是正常的）...
echo.
echo ⚠️  警告说明：
echo    - npm warn deprecated 是正常的
echo    - 不会影响构建和运行
echo    - 详情查看 DEPENDENCY_WARNINGS.md
echo.
echo 开始安装...
echo.

npm install

if %errorlevel% equ 0 (
  echo.
  echo ======================================
  echo   ✅ 安装成功！
  echo ======================================
  echo.
  echo 下一步：
  echo   1. npm run typecheck  - 检查类型
  echo   2. npm run build      - 构建前端
  echo   3. git add .          - 提交到 GitHub
  echo.
) else (
  echo.
  echo ❌ 安装失败
  echo 请检查网络连接或使用：
  echo   npm install --legacy-peer-deps
  pause
  exit /b 1
)

pause
