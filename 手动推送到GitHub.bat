@echo off
setlocal
cd /d "%~dp0"
echo Pushing current main to origin...
git push origin main
if errorlevel 1 (
  echo.
  echo Push failed. Check network, GitHub login, and remote permissions.
) else (
  echo.
  echo Push succeeded.
)
echo.
pause
