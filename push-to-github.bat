@echo off
cd /d "%~dp0"
git init
git add .
git commit -m "Initial commit - Cayo restaurant app"
git branch -M main
git remote add origin https://github.com/cayo-restaurant/cayo.git
git push -u origin main
echo.
echo Done! Code pushed to GitHub.
pause
