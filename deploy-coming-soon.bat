@echo off
cd /d "%~dp0"
git add -A
git commit -m "Switch to Coming Soon / Under Construction page"
git push origin main
echo.
echo Done! Site will update on Vercel in a minute.
pause
