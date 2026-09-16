@echo off
chcp 65001 >nul
setlocal
title Gongkao V1 Server

cd /d "%~dp0"

where node >nul 2>&1
if errorlevel 1 goto :node_missing

where npm.cmd >nul 2>&1
if errorlevel 1 goto :npm_missing

if exist "dist\server.js" goto :start_server

echo 未发现生产构建，正在执行构建...
call npm.cmd run build
if errorlevel 1 goto :build_failed

:start_server
echo.
echo 正在启动 Gongkao V1。浏览器将在服务准备后自动打开...
start "" /b cmd.exe /d /c "ping -n 3 127.0.0.1 >nul & start http://localhost:3000"
call npm.cmd start
echo.
echo [错误] Gongkao V1 服务已停止或启动失败。
pause
exit /b 1

:node_missing
echo [错误] 未找到 Node.js。请安装 Node.js 后重试。
pause
exit /b 1

:npm_missing
echo [错误] 未找到 npm.cmd。请检查 Node.js 安装是否完整。
pause
exit /b 1

:build_failed
echo [错误] 构建失败，服务未启动。
pause
exit /b 1
