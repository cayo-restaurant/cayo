@echo off
cd /d "%~dp0"
echo.
echo ==== Cayo deploy script ====
echo.
echo Installing new dependencies (next-auth)...
call npm install
if errorlevel 1 (
  echo npm install failed. Aborting.
  pause
  exit /b 1
)
echo.
echo Committing and pushing...
git add .
git commit -m "Replace admin password login with Google OAuth (NextAuth)"
git push
echo.
echo Done! Check Vercel for the new deployment.
pause
