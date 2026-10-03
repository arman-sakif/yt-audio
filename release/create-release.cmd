@echo off
setlocal EnableExtensions
cd /d "%~dp0.."

where git >nul 2>&1
if errorlevel 1 (
  echo Git is required to build a release.
  pause
  exit /b 1
)

where node >nul 2>&1
if errorlevel 1 (
  echo Install Node.js from https://nodejs.org and run this again.
  pause
  exit /b 1
)

git rev-parse --is-inside-work-tree >nul 2>&1
if errorlevel 1 (
  echo This project is not a git repository.
  pause
  exit /b 1
)

set "STATUS=%TEMP%\yt-audio-release-status.txt"
set "DIRTY=%TEMP%\yt-audio-release-dirty.txt"
git status --porcelain --untracked-files=normal > "%STATUS%"
findstr /v /c:" release/" "%STATUS%" > "%DIRTY%"
if not errorlevel 1 (
  echo Commit your changes first. A release is built from the latest commit.
  type "%DIRTY%"
  del "%STATUS%" "%DIRTY%"
  pause
  exit /b 1
)
del "%STATUS%" "%DIRTY%"

for /f "delims=" %%v in ('node -p "require('./package.json').version"') do set "VERSION=%%v"
if not defined VERSION (
  echo Could not read the version from package.json.
  pause
  exit /b 1
)

set "OUT=%~dp0yt-audio-%VERSION%.zip"
if exist "%OUT%" (
  echo %OUT% already exists.
  echo Bump "version" in package.json, then run this again.
  pause
  exit /b 1
)

git archive --format=zip --output="%OUT%" HEAD
if errorlevel 1 (
  echo Could not create the release.
  pause
  exit /b 1
)

echo Created %OUT%
pause
exit /b 0
