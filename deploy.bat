@echo off
cd /d "%~dp0"
echo.
echo ==== Cayo deploy script ====
echo.

REM Check for .env files in git staging
git diff --cached --name-only | findstr /I ".env" >nul
if %ERRORLEVEL% EQU 0 (
  echo ERROR: .env files staged for commit. Aborting to protect secrets.
  echo Please remove them with: git reset HEAD ^<filename^>
  pause
  exit /b 1
)

REM Use commit message from command-line argument, or default
if "%1"=="" (
  set "MSG=Deploy from batch script"
) else (
  set "MSG=%*"
)

echo Committing with message: %MSG%
git add app/ lib/ components/ public/ next.config.js tsconfig.json package.json
git commit -m "%MSG%"

if %ERRORLEVEL% NEQ 0 (
  echo Commit failed. Check git status.
  pause
  exit /b 1
)

echo Pushing to origin...
git push

if %ERRORLEVEL% EQU 0 (
  echo.
  echo Done\! Check Vercel for the new deployment.
) else (
  echo Push failed.
)

pause
