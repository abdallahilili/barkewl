@echo off
REM RAQEEM PHARMA - acces a la base de donnees (support Rawafid Digital Services, administrateurs seulement)
net session >nul 2>&1
if errorlevel 1 (
    powershell -NoProfile -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
    exit /b
)
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0outils\base_de_donnees.ps1"
