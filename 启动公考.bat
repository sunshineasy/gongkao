@echo off
setlocal
title Gongkao Server

cd /d "%~dp0"

set "PORT_PID="
for /f "tokens=5" %%P in ('netstat -ano ^| findstr /r /c:":3000 .*LISTENING"') do set "PORT_PID=%%P"
if defined PORT_PID goto :already_running

where node >nul 2>&1
if errorlevel 1 goto :node_missing

where npm.cmd >nul 2>&1
if errorlevel 1 goto :npm_missing

if not exist "dist\server.js" (
  echo Building Gongkao...
  call npm.cmd run build
  if errorlevel 1 goto :build_failed
)

echo Starting Gongkao at http://localhost:3000 ...
start "" /b cmd.exe /d /c "ping -n 3 127.0.0.1 >nul ^& start http://localhost:3000"
call npm.cmd start
echo.
echo Gongkao stopped or could not start.
pause
exit /b 1

:already_running
echo Gongkao is already running at http://localhost:3000 (PID %PORT_PID%).
start "" http://localhost:3000
exit /b 0

:node_missing
echo Node.js was not found. Install Node.js, then run this file again.
pause
exit /b 1

:npm_missing
echo npm.cmd was not found. Repair the Node.js installation, then try again.
pause
exit /b 1

:build_failed
echo Build failed. Gongkao was not started.
pause
exit /b 1
