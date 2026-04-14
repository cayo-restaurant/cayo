@echo off
cd /d "%~dp0"
echo.
echo ==== Cayo deploy script ====
echo.
echo Committing and pushing...
git add .
git commit -m "Host dashboard: compact swipe-to-action row, tap-to-expand details"
git push
echo.
echo Done! Check Vercel for the new deployment.
pause
