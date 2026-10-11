@echo off
REM A executer sur une machine AVEC internet (Python + pip installes), PAS sur le PC cible.
REM Telecharge tous les paquets Python necessaires (wheels Windows 64-bit, Python 3.12)
REM dans deploy\offline_packages, a copier ensuite sur le PC cible (cle USB, etc.)

cd /d "%~dp0..\backend"

pip download ^
    --platform win_amd64 ^
    --python-version 3.12 ^
    --implementation cp ^
    --abi cp312 ^
    --only-binary=:all: ^
    -r requirements.txt ^
    -d "%~dp0offline_packages"

pip download waitress -d "%~dp0offline_packages"

echo.
echo Termine. Copie tout le dossier "deploy\offline_packages" sur le PC cible
echo (avec le reste du projet), puis sur le PC cible :
echo   cd backend
echo   python -m venv venv
echo   venv\Scripts\activate
echo   pip install --no-index --find-links=..\deploy\offline_packages -r requirements.txt waitress
pause
