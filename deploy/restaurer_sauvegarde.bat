@echo off
REM Restauration d'une sauvegarde Raqim : REMPLACE TOUTES LES DONNEES ACTUELLES.
REM Une sauvegarde de securite de l'etat actuel est faite automatiquement juste avant.
REM Usage : double-clic pour voir la liste, puis saisir le nom du fichier
REM         (ou glisser-deposer un fichier .sql.gz, par exemple depuis une cle USB, sur ce script).
cd /d "%~dp0..\backend"
set PYTHON="%~dp0..\backend\venv\Scripts\python.exe"

if not "%~1"=="" (
    set FICHIER=%~1
    goto restaurer
)

%PYTHON% manage.py restaurer_sauvegarde
echo.
set /p FICHIER=Nom du fichier a restaurer (vide = annuler) :
if "%FICHIER%"=="" goto fin

:restaurer
schtasks /end /tn "RaqimBackend" >nul 2>&1
schtasks /end /tn "BarkewlBackend" >nul 2>&1
%PYTHON% manage.py restaurer_sauvegarde "%FICHIER%"
schtasks /run /tn "RaqimBackend" >nul 2>&1 || schtasks /run /tn "BarkewlBackend" >nul 2>&1

:fin
echo.
pause
