@echo off
REM Lancement manuel du backend (sans service), utile pour tester avant d'installer le service NSSM.
cd /d "%~dp0..\backend"
call venv\Scripts\activate
waitress-serve --host=127.0.0.1 --port=8000 config.wsgi:application
pause
