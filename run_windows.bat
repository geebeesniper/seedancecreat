@echo off
setlocal
cd /d %~dp0
if not exist .env copy .env.example .env >nul
if not exist node_modules (
  echo Installing Node dependencies...
  call npm install
  if errorlevel 1 exit /b 1
)
echo Starting GS-One TypeScript SaaS...
call npm run dev
