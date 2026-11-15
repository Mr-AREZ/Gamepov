@echo off
cd /d "%~dp0"
echo ==== Gamepov ====
where node >nul 2>nul
if %errorlevel%==0 (
  node scripts/build.js
  start "" http://localhost:8080
  echo Server is running at http://localhost:8080  (close this window to stop)
  node scripts/serve.js 8080
  goto :eof
)
where python >nul 2>nul
if %errorlevel%==0 (
  echo Node.js not found - serving the pre-built "dist" folder with Python.
  start "" http://localhost:8080
  python -m http.server 8080 --directory dist
  goto :eof
)
echo.
echo Please install Node.js (LTS) from https://nodejs.org and run this file again.
pause
