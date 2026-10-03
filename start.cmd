@echo off
cd /d "%~dp0"
where node >nul 2>&1
if errorlevel 1 (
  echo Install Node.js from https://nodejs.org and run this again.
  pause
  exit /b 1
)
node server.js
if errorlevel 1 pause
