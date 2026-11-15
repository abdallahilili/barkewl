# RAQEEM PHARMA - désinstallation (Rawafid Digital Services).
# Lancé par « Desinstaller.bat » (administrateur) ou par Paramètres Windows > Applications installées.
#
# Retire : la tâche de démarrage, le service « RaqeemMySQL » (paquet complet), la règle de pare-feu, le
# raccourci du bureau, l'inscription dans « Applications installées » et le dossier d'installation.
# PROTÈGE LES DONNÉES : une dernière sauvegarde est faite, puis TOUTES les sauvegardes sont copiées dans
# C:\RaqeemPharma_sauvegardes_<date>, qui n'est pas supprimé. Une base dans WampServer n'est pas supprimée.
param(
    [string]$Dossier = "C:\RaqeemPharma",
    [switch]$SansTache,     # tests : sans droits administrateur (pas de tâche, service, pare-feu, registre)
    [switch]$Confirmer      # tests : pas de question (équivaut à répondre OUI)
)
$ErrorActionPreference = "Continue"
try { [Console]::OutputEncoding = [Text.Encoding]::UTF8 } catch { }
$NomTache = "RaqeemPharma"
$NomServiceMysql = "RaqeemMySQL"
$CleDesinstallation = "HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\RaqeemPharma"

function Titre($texte) { Write-Host ""; Write-Host "==> $texte" -ForegroundColor Cyan }
function Ok($texte) { Write-Host "    OK  $texte" -ForegroundColor Green }
function Attention($texte) { Write-Host "    Attention : $texte" -ForegroundColor Yellow }
function Arret($texte) { Write-Host ""; Write-Host $texte -ForegroundColor Red; exit 1 }

Write-Host ""
Write-Host "  =====================================================" -ForegroundColor DarkCyan
Write-Host "    RAQEEM PHARMA  -  Désinstallation" -ForegroundColor White
Write-Host "    Rawafid Digital Services" -ForegroundColor Gray
Write-Host "  =====================================================" -ForegroundColor DarkCyan

$Dossier = $Dossier.TrimEnd("\")
if (-not (Test-Path (Join-Path $Dossier "app\backend"))) { Arret "RAQEEM PHARMA n'est pas installé dans $Dossier." }
if (-not $SansTache) {
    $admin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
    if (-not $admin) { Arret "Lancez « Desinstaller.bat » en administrateur." }
}
$mysqlInclus = Test-Path (Join-Path $Dossier "mysql_root.txt")
$copieSauvegardes = "{0}_sauvegardes_{1}" -f $Dossier, (Get-Date -Format "yyyy-MM-dd_HHmm")

Write-Host ""
Write-Host "  Seront supprimés :" -ForegroundColor White
Write-Host "    - le logiciel ($Dossier) et son démarrage automatique"
if ($mysqlInclus) { Write-Host "    - le MySQL de RAQEEM PHARMA et SA BASE DE DONNÉES (service $NomServiceMysql)" -ForegroundColor Yellow }
Write-Host "    - le raccourci du bureau"
Write-Host "  Seront conservés :" -ForegroundColor White
Write-Host "    - toutes les sauvegardes, copiées dans $copieSauvegardes"
if (-not $mysqlInclus) { Write-Host "    - la base de données dans WampServer / MySQL (à supprimer à la main si besoin)" }
Write-Host ""
if (-not $Confirmer) {
    $reponse = Read-Host "  Tapez OUI pour désinstaller (autre réponse : annuler)"
    if ($reponse.Trim().ToUpper() -ne "OUI") { Write-Host "  Désinstallation annulée : rien n'a été modifié." -ForegroundColor Yellow; exit 0 }
}

# ---------------------------------------------------------------- 1. Dernière sauvegarde
Titre "1/5  Dernière sauvegarde"
$py = Join-Path $Dossier "python\python.exe"
$sauvegardeOk = $false
if (Test-Path $py) {
    Push-Location (Join-Path $Dossier "app\backend")
    $env:PYTHONIOENCODING = "utf-8"
    $sortie = & $py manage.py sauvegarder 2>&1 | Out-String
    $sauvegardeOk = ($LASTEXITCODE -eq 0 -and $sortie -match "\.sql(\.gz)?")
    Pop-Location
}
if ($sauvegardeOk) { Ok "Sauvegarde faite" }
else {
    Attention "dernière sauvegarde impossible (MySQL arrêté ?)."
    if (-not $Confirmer) {
        $reponse = Read-Host "  Continuer quand même avec les sauvegardes existantes ? Tapez OUI pour continuer"
        if ($reponse.Trim().ToUpper() -ne "OUI") { Write-Host "  Désinstallation annulée : rien n'a été modifié." -ForegroundColor Yellow; exit 0 }
    }
}
New-Item -ItemType Directory -Force -Path $copieSauvegardes | Out-Null
$sauvegardes = Join-Path $Dossier "sauvegardes"
if (Test-Path $sauvegardes) {
    robocopy $sauvegardes $copieSauvegardes /E /NFL /NDL /NJH /NJS /NP | Out-Null
    if ($LASTEXITCODE -ge 8) { Arret "Copie des sauvegardes impossible : désinstallation arrêtée, rien n'a été supprimé." }
}
$nombre = @(Get-ChildItem $copieSauvegardes -File -ErrorAction SilentlyContinue).Count
Ok "$nombre sauvegarde(s) conservée(s) dans $copieSauvegardes"

# ---------------------------------------------------------------- 2. Arrêt du logiciel
Titre "2/5  Arrêt du logiciel"
if (-not $SansTache) {
    Stop-ScheduledTask -TaskName $NomTache -ErrorAction SilentlyContinue
    Unregister-ScheduledTask -TaskName $NomTache -Confirm:$false -ErrorAction SilentlyContinue
}
Get-CimInstance Win32_Process | Where-Object { $_.ExecutablePath -like "$Dossier\*" -and $_.Name -ne "mysqld.exe" } |
    ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
Ok "Logiciel arrêté, démarrage automatique retiré"

# ---------------------------------------------------------------- 3. MySQL inclus
Titre "3/5  Base de données"
if ($mysqlInclus) {
    $service = Get-CimInstance Win32_Service -Filter "Name='$NomServiceMysql'" -ErrorAction SilentlyContinue
    if ($service -and $service.PathName -like "*$Dossier\mysql\*") {
        Stop-Service -Name $NomServiceMysql -Force -ErrorAction SilentlyContinue
        & (Join-Path $Dossier "mysql\bin\mysqld.exe") --remove $NomServiceMysql 2>&1 | Out-Null
        if (Get-Service $NomServiceMysql -ErrorAction SilentlyContinue) { sc.exe delete $NomServiceMysql | Out-Null }
    }
    # MySQL lancé comme simple programme (mode test) ou service déjà arrêté
    Get-CimInstance Win32_Process -Filter "Name='mysqld.exe'" | Where-Object { $_.ExecutablePath -like "$Dossier\*" } |
        ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
    Ok "MySQL de RAQEEM PHARMA arrêté et retiré"
} else {
    Ok "Base conservée dans WampServer / MySQL (base « raqeem »)"
}

# ---------------------------------------------------------------- 4. Raccourci, pare-feu, inscription Windows
Titre "4/5  Raccourci et inscription Windows"
if (-not $SansTache) {
    Remove-Item (Join-Path ([Environment]::GetFolderPath("CommonDesktopDirectory")) "RAQEEM PHARMA.url") -Force -ErrorAction SilentlyContinue
    netsh advfirewall firewall delete rule name="RAQEEM PHARMA" 2>&1 | Out-Null
    Remove-Item $CleDesinstallation -Recurse -Force -ErrorAction SilentlyContinue
}
Ok "Raccourci, pare-feu et inscription retirés"

# ---------------------------------------------------------------- 5. Dossier d'installation
Titre "5/5  Suppression de $Dossier"
Start-Sleep -Seconds 3
Set-Location $env:TEMP
for ($i = 0; $i -lt 5 -and (Test-Path $Dossier); $i++) {
    Remove-Item -Recurse -Force $Dossier -ErrorAction SilentlyContinue
    if (Test-Path $Dossier) { Start-Sleep -Seconds 2 }
}
if (Test-Path $Dossier) { Attention "certains fichiers de $Dossier n'ont pas pu être supprimés : redémarrez le PC puis supprimez le dossier." }
else { Ok "Dossier supprimé" }

Write-Host ""
Write-Host "  =====================================================" -ForegroundColor Green
Write-Host "    RAQEEM PHARMA est désinstallé." -ForegroundColor Green
Write-Host "  =====================================================" -ForegroundColor Green
Write-Host "    Sauvegardes conservées : $copieSauvegardes"
