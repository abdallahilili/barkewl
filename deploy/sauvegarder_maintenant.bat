@echo off
REM Sauvegarde immediate de la base Barkewl (double-clic).
REM Les sauvegardes automatiques sont deja faites par le serveur ; ce script sert
REM avant une intervention (mise a jour, changement de PC...).
cd /d "%~dp0..\backend"
"%~dp0..\backend\venv\Scripts\python.exe" manage.py sauvegarder
echo.
pause
