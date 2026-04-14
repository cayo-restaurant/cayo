@echo off
cd /d "%~dp0"
echo.
echo ==== Cayo deploy script ====
echo.
echo Committing and pushing...
git add .
git commit -m "Fix ReservationLike type (build). Split /host: marked reservations move to /host/marked (separate page), navigation card on main queue."
git push
echo.
echo Done! Check Vercel for the new deployment.
pause
