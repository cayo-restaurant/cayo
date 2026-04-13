@echo off
cd /d "%~dp0"
echo.
echo ==== Cayo deploy script ====
echo.
git add .
git commit -m "Wire reservations to Supabase + admin dashboard + area field"
git push
echo.
echo Done! Check Vercel for the new deployment.
pause
