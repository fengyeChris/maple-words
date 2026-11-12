@echo off
chcp 65001 >nul
cd /d "%~dp0"
if exist "runtime\node.exe" (
  "runtime\node.exe" scripts\launch.js
) else (
  where node >nul 2>nul
  if errorlevel 1 (
    echo 请使用包含 runtime 的完整离线包，或先安装 Node.js 并运行 npm install。
    pause
    exit /b 1
  )
  node scripts\launch.js
)
pause
