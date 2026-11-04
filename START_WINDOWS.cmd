@echo off
cd /d "%~dp0"
where node >nul 2>&1
if errorlevel 1 (
 echo Please install Node.js 22+ from nodejs.org
 pause
 exit /b 1
)
start "" http://127.0.0.1:8766
node src/server.mjs
pause
