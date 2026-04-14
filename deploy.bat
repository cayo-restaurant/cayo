@echo off
cd /d "%~dp0"
echo.
echo ==== Cayo deploy script ====
echo.
echo Committing and pushing...
git add .
git commit -m "Capacity gate (bar=14, table=50 guests, 2h duration) + last slot 21:30. Shift-day+auto-no_show for hostess. Single total-guests stat card."
git push
echo.
echo Done! Check Vercel for the new deployment.
pause
