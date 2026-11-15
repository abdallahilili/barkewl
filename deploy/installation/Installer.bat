@echo off
chcp 65001 >nul
title RAQEEM PHARMA - Installation
REM Demande les droits administrateur si nécessaire, puis lance l'installation.
net session >nul 2>&1
if %errorlevel% neq 0 (
    powershell -NoProfile -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
    exit /b
)
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0installer.ps1" %*
echo.
pause
