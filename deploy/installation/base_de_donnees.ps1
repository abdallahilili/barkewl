# RAQEEM PHARMA - ouvre la base de données dans HeidiSQL (support Rawafid Digital Services).
# Lancé par « Base_de_donnees.bat » (administrateur). Lit le port (mysql.ini) et le mot de passe root
# (mysql_root.txt, réservé aux administrateurs) du MySQL installé avec le logiciel.
$ErrorActionPreference = "Stop"
$dossier = Split-Path -Parent $PSScriptRoot
try {
    $mdp = (Get-Content (Join-Path $dossier "mysql_root.txt") -TotalCount 1).Trim()
    $port = ((Get-Content (Join-Path $dossier "mysql.ini")) -match "^port=" | Select-Object -First 1).Substring(5)
} catch {
    Write-Host "Configuration MySQL de RAQEEM PHARMA introuvable (mysql_root.txt / mysql.ini)." -ForegroundColor Red
    Read-Host "Appuyez sur Entrée"
    exit 1
}
Write-Host "RAQEEM PHARMA - base « raqeem » (MySQL, port $port)" -ForegroundColor Cyan
Write-Host "ATTENTION : consultez librement, mais ne modifiez pas les données sans sauvegarde préalable." -ForegroundColor Yellow
Start-Process (Join-Path $PSScriptRoot "HeidiSQL\heidisql.exe") -ArgumentList @(
    "--nettype=0", "--host=127.0.0.1", "--port=$port", "--user=root", "--password=$mdp", "--databases=raqeem",
    "`"-d=RAQEEM PHARMA`""
)
