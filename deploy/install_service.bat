@echo off
REM Installe le backend Django (via Waitress) comme service Windows avec NSSM.
REM Prerequis : avoir telecharge nssm.exe (https://nssm.cc/download) et note son chemin.
REM A executer en Administrateur (clic droit > Executer en tant qu'administrateur).

REM ---- A ADAPTER avant de lancer ----
set NSSM=C:\nssm\nssm.exe
set BACKEND_DIR=C:\Users\hpi7\Desktop\Rawafid\Barkewl\backend
set VENV_WAITRESS=%BACKEND_DIR%\venv\Scripts\waitress-serve.exe
set SERVICE_NAME=BarkewlBackend
REM ------------------------------------

if not exist "%NSSM%" (
    echo ERREUR: nssm.exe introuvable a "%NSSM%". Corrige la variable NSSM dans ce script.
    pause
    exit /b 1
)

if not exist "%VENV_WAITRESS%" (
    echo ERREUR: waitress-serve.exe introuvable. As-tu fait "pip install waitress" dans le venv ?
    pause
    exit /b 1
)

"%NSSM%" install %SERVICE_NAME% "%VENV_WAITRESS%" "--host=127.0.0.1" "--port=8000" "config.wsgi:application"
"%NSSM%" set %SERVICE_NAME% AppDirectory "%BACKEND_DIR%"
"%NSSM%" set %SERVICE_NAME% Start SERVICE_AUTO_START
"%NSSM%" set %SERVICE_NAME% AppStdout "%BACKEND_DIR%\logs\service.log"
"%NSSM%" set %SERVICE_NAME% AppStderr "%BACKEND_DIR%\logs\service-erreurs.log"

if not exist "%BACKEND_DIR%\logs" mkdir "%BACKEND_DIR%\logs"

"%NSSM%" start %SERVICE_NAME%

echo.
echo Service "%SERVICE_NAME%" installe et demarre.
echo Pour le gerer ensuite : nssm start/stop/restart/remove %SERVICE_NAME%
pause
