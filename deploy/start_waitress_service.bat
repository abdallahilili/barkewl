@echo off
REM Script lance par le Planificateur de taches Windows au demarrage.
REM N'utilise pas "call venv\Scripts\activate" (pas fiable en tache non interactive) :
REM on appelle directement l'executable waitress-serve du venv.
cd /d "%~dp0..\backend"
"%~dp0..\backend\venv\Scripts\waitress-serve.exe" --host=127.0.0.1 --port=8000 config.wsgi:application
