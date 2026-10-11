@echo off
REM Alternative a NSSM : enregistre le backend comme tache planifiee Windows,
REM demarree automatiquement a chaque demarrage du PC, sans telechargement externe.
REM A executer en Administrateur (clic droit > Executer en tant qu'administrateur).

set TASK_NAME=BarkewlBackend
set SCRIPT=%~dp0start_waitress_service.bat

schtasks /create /tn "%TASK_NAME%" /tr "\"%SCRIPT%\"" /sc onstart /ru SYSTEM /rl HIGHEST /f

if %errorlevel% neq 0 (
    echo ERREUR lors de la creation de la tache planifiee.
    pause
    exit /b 1
)

echo.
echo Tache "%TASK_NAME%" creee : le backend demarrera automatiquement a chaque
echo demarrage de Windows, meme sans session ouverte.
echo.
echo Pour la lancer tout de suite sans redemarrer le PC :
echo     schtasks /run /tn "%TASK_NAME%"
echo Pour l'arreter :
echo     schtasks /end /tn "%TASK_NAME%"
echo Pour la supprimer :
echo     schtasks /delete /tn "%TASK_NAME%" /f
echo.
echo Note : comme Wamp (MySQL) ne demarre pas forcement tout seul avec Windows,
echo pense a configurer WampServer pour demarrer Apache/MySQL comme services
echo (ou lancer wampmanager.exe au demarrage) sinon le backend demarrera avant
echo que MySQL soit pret et les requetes a la base echoueront jusqu'au prochain
echo redemarrage du service (schtasks /run /tn "%TASK_NAME%" une fois Wamp lance).
pause
