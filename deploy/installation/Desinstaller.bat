@echo off
chcp 65001 >nul
title RAQEEM PHARMA - Desinstallation
REM Demande les droits administrateur si necessaire.
net session >nul 2>&1
if %errorlevel% neq 0 (
    if "%~1"=="" (
        powershell -NoProfile -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
    ) else (
        powershell -NoProfile -Command "Start-Process -FilePath '%~f0' -ArgumentList '%*' -Verb RunAs"
    )
    exit /b
)
REM Le script est lance depuis une copie dans TEMP : ce fichier peut se trouver dans le dossier supprime.
REM Tout est sur une seule ligne, lue en entier par cmd avant l'execution.
copy /y "%~dp0desinstaller.ps1" "%TEMP%\raqeem_desinstaller.ps1" >nul & powershell -NoProfile -ExecutionPolicy Bypass -File "%TEMP%\raqeem_desinstaller.ps1" %* & pause & exit /b
