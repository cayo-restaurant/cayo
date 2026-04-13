@echo off
cd /d "%~dp0"
echo.
echo ==== Cayo deploy script ====
echo.
git add .
git commit -m "Fix zod v4 enum/literal syntax for build"
git push
echo.
echo Done! Check Vercel for the new deployment.
pause
