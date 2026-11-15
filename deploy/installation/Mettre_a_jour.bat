@echo off
chcp 65001 >nul
title RAQEEM PHARMA - Mise a jour
REM Demande les droits administrateur si nécessaire, puis lance la mise à jour.
net session >nul 2>&1
if %errorlevel% neq 0 (
    powershell -NoProfile -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
    exit /b
)
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0mettre_a_jour.ps1" %*
echo.
pause
