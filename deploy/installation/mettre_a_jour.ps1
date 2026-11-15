# RAQEEM PHARMA - mise à jour chez le client (Rawafid Digital Services).
# Lancé par « Mettre_a_jour.bat » (en administrateur), depuis le dossier du NOUVEAU paquet.
#
# Sécurité : 1) sauvegarde de la base  2) copie de l'ancienne version (logiciel, composants, Python)  3) mise à jour
# Si une étape échoue : l'ancienne version ET la base d'avant la mise à jour sont remises en place automatiquement.
param(
    [string]$Dossier = "C:\RaqeemPharma",
    [switch]$SansTache          # tests : pas d'arrêt/démarrage de la tâche planifiée
)
# « Continue » : chaque étape vérifie explicitement le code de sortie des programmes (python, robocopy).
# Sous PowerShell 5.1, « Stop » interromprait le script au premier message d'information de Python.
$ErrorActionPreference = "Continue"
try { [Console]::OutputEncoding = [Text.Encoding]::UTF8 } catch { }
$Paquet = Split-Path -Parent $MyInvocation.MyCommand.Path
. (Join-Path $PSScriptRoot "commun.ps1")   # fonctions communes avec la mise à jour
$app = Join-Path $Dossier "app"
$precedent = Join-Path $Dossier "app.precedent"
$py = Join-Path $Dossier "python\python.exe"
$lib = Join-Path $Dossier "lib"
$libPrecedent = Join-Path $Dossier "lib.precedent"
$python = Join-Path $Dossier "python"
$pythonPrecedent = Join-Path $Dossier "python.precedent"
$backend = Join-Path $app "backend"

function Arreter-Serveur {
    if ($SansTache) { return }
    schtasks /end /tn $NomTache 2>$null | Out-Null
    Get-CimInstance Win32_Process -Filter "Name='python.exe'" |
        Where-Object { $_.ExecutablePath -like "$Dossier*" -and $_.CommandLine -like "*waitress*" } |
        ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
    Start-Sleep -Seconds 2
}
function Demarrer-Serveur {
    if ($SansTache) { return }
    # Réglages de la tâche remis à neuf à chaque mise à jour (anciennes versions : arrêt après 72 h, pas sur batterie).
    $bat = Join-Path $Dossier "demarrer_serveur.bat"
    if (Test-Path $bat) { try { Enregistrer-Tache $NomTache $bat } catch { Write-Host "Tâche non mise à jour : $($_.Exception.Message)" -ForegroundColor Yellow } }
    Start-ScheduledTask -TaskName $NomTache -ErrorAction SilentlyContinue
    $ligne = Get-Content (Join-Path $backend ".env") | Where-Object { $_ -like "BD_PORT=*" } | Select-Object -First 1
    $portBase = 3306
    if ($ligne) { $portBase = [int]$ligne.Substring(8) }
    try { Activer-DemarrageMysql $portBase } catch { Write-Host "Démarrage automatique de MySQL non réglé : $($_.Exception.Message)" -ForegroundColor Yellow }
}

$nouvelle = (Get-Content (Join-Path $Paquet "VERSION.txt") | Select-Object -First 1)
$ancienne = (Get-Content (Join-Path $Dossier "VERSION.txt") -ErrorAction SilentlyContinue | Select-Object -First 1)
Write-Host ""
Write-Host "  RAQEEM PHARMA  -  Mise à jour $ancienne  ->  $nouvelle" -ForegroundColor White
Write-Host "  Rawafid Digital Services" -ForegroundColor Gray

if (-not (Test-Path (Join-Path $backend ".env"))) { Write-Host "RAQEEM PHARMA n'est pas installé dans $Dossier." -ForegroundColor Red; exit 1 }
if (-not $SansTache) {
    $admin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
    if (-not $admin) { Write-Host "Lancez « Mettre_a_jour.bat » en administrateur." -ForegroundColor Red; exit 1 }
}

# ---------------------------------------------------------------- 1. Sauvegarde
# Le nom du fichier est repéré par son extension (.sql.gz) et non par la phrase « Sauvegarde créée » :
# selon la console, les accents peuvent arriver déformés.
Titre "1/5  Sauvegarde de la base"
Push-Location $backend
$env:PYTHONIOENCODING = "utf-8"
$sortie = & $py manage.py sauvegarder 2>&1 | Out-String
$codeSauvegarde = $LASTEXITCODE
Pop-Location
if ($codeSauvegarde -ne 0 -or $sortie -notmatch ": (\S+\.sql(?:\.gz)?)") {
    Write-Host $sortie
    Write-Host "ERREUR : sauvegarde impossible. Mise à jour annulée, rien n'a été modifié." -ForegroundColor Red
    exit 1
}
$fichierSauvegarde = $Matches[1]
Ok "Sauvegarde $fichierSauvegarde"

# ---------------------------------------------------------------- 2. Arrêt et copie de l'ancienne version
Titre "2/5  Arrêt du logiciel et conservation de la version actuelle"
Arreter-Serveur
Copier $app $precedent
Copier $lib $libPrecedent
Copier $python $pythonPrecedent
Ok "Version actuelle conservée dans $precedent"

$baseModifiee = $false
try {
    # ------------------------------------------------------------ 3. Nouvelle version
    Titre "3/5  Installation de la version $nouvelle"
    # La configuration (.env) et les journaux du poste sont conservés.
    Copier (Join-Path $Paquet "app\backend") $backend @("/XF", ".env", "/XD", "logs", "sauvegardes")
    Copier (Join-Path $Paquet "app\interface") (Join-Path $app "interface")
    # Python embarqué aussi : une nouvelle version du logiciel peut demander un Python plus récent.
    Copier (Join-Path $Paquet "python") $python
    Copier (Join-Path $Paquet "lib") $lib
    Write-CheminsPython $Dossier
    # Configuration des versions antérieures : « HOTES_AUTORISES=* » (tous les noms acceptés) est remplacé
    # par ce PC seulement, plus son nom et ses adresses réseau s'il sert plusieurs postes.
    $fichierEnv = Join-Path $backend ".env"
    $lignesEnv = [IO.File]::ReadAllLines($fichierEnv)
    if ($lignesEnv -contains "HOTES_AUTORISES=*") {
        $plusieursPostes = $false
        try { $plusieursPostes = [bool](Get-Content (Join-Path $Dossier "installation.json") -Raw | ConvertFrom-Json).reseau } catch { }
        $lignesEnv = @($lignesEnv | ForEach-Object {
            if ($_ -eq "HOTES_AUTORISES=*") {
                "HOTES_AUTORISES=localhost,127.0.0.1,$env:COMPUTERNAME"
                "HOTES_RESEAU_LOCAL=$(if ($plusieursPostes) { '1' } else { '0' })"
            } else { $_ }
        })
        [IO.File]::WriteAllLines($fichierEnv, $lignesEnv, (New-Object Text.UTF8Encoding $false))
    }
    Ok "Fichiers et composants à jour"

    # ------------------------------------------------------------ 4. Base de données
    Titre "4/5  Mise à jour de la base"
    Push-Location $backend
    try {
        $baseModifiee = $true
        & $py manage.py migrate --noinput -v 0
        if ($LASTEXITCODE -ne 0) { throw "Mise à jour de la base impossible." }
        & $py manage.py check --database default
        if ($LASTEXITCODE -ne 0) { throw "Vérification du logiciel en échec." }
    } finally { Pop-Location }
    Ok "Base à jour"
}
catch {
    Write-Host ""
    Write-Host "ERREUR : $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "Retour automatique à la version $ancienne..." -ForegroundColor Yellow
    Copier $precedent $app
    Copier $libPrecedent $lib
    Copier $pythonPrecedent $python
    Write-CheminsPython $Dossier
    if ($baseModifiee) {
        Push-Location $backend
        & $py manage.py restaurer_sauvegarde $fichierSauvegarde --oui
        Pop-Location
        Write-Host "    Base remise à l'état d'avant la mise à jour ($fichierSauvegarde)." -ForegroundColor Yellow
    }
    Demarrer-Serveur
    Write-Host "La version $ancienne fonctionne de nouveau. Contactez Rawafid Digital Services." -ForegroundColor Yellow
    exit 1
}

# ---------------------------------------------------------------- 5. Redémarrage et vérification
Titre "5/5  Redémarrage"
Copy-Item (Join-Path $Paquet "VERSION.txt") (Join-Path $Dossier "VERSION.txt") -Force -ErrorAction Stop
# Outil d'accès à la base (HeidiSQL), pour les installations avec le MySQL inclus.
if ((Test-Path (Join-Path $Paquet "outils\HeidiSQL\heidisql.exe")) -and (Test-Path (Join-Path $Dossier "mysql_root.txt"))) {
    try {
        Copier (Join-Path $Paquet "outils") (Join-Path $Dossier "outils") @("/XF", "portable_settings.txt")
        Copy-Item (Join-Path $Paquet "Base_de_donnees.bat") $Dossier -Force
        if (-not $SansTache) { icacls (Join-Path $Dossier "outils") /inheritance:r /grant:r "*S-1-5-32-544:(OI)(CI)F" "*S-1-5-18:(OI)(CI)F" | Out-Null }
        Ok "Accès à la base : $Dossier\Base_de_donnees.bat (administrateurs)"
    } catch { Write-Host "Outil d'accès à la base non installé : $($_.Exception.Message)" -ForegroundColor Yellow }
}
# Raccourci du bureau avec l'icône RAQEEM (les anciennes versions n'en avaient pas).
if (-not $SansTache -and (Test-Path (Join-Path $Paquet "raqeem.ico"))) {
    try {
        $icone = Join-Path $Dossier "raqeem.ico"
        Copy-Item (Join-Path $Paquet "raqeem.ico") $icone -Force
        $portLogiciel = (Get-Content (Join-Path $Dossier "installation.json") -Raw | ConvertFrom-Json).port
        $raccourci = Join-Path ([Environment]::GetFolderPath("CommonDesktopDirectory")) "RAQEEM PHARMA.url"
        @("[InternetShortcut]", "URL=http://localhost:$portLogiciel/", "IconFile=$icone", "IconIndex=0") | Set-Content -Path $raccourci -Encoding ASCII
    } catch { Write-Host "Raccourci non mis à jour : $($_.Exception.Message)" -ForegroundColor Yellow }
}
Demarrer-Serveur
if (-not $SansTache) {
    $info = Get-Content (Join-Path $Dossier "installation.json") -Raw | ConvertFrom-Json
    $repond = $false
    for ($i = 0; $i -lt 30 -and -not $repond; $i++) {
        Start-Sleep -Seconds 2
        try { $repond = (Invoke-WebRequest "http://127.0.0.1:$($info.port)/api/licence/" -UseBasicParsing -TimeoutSec 3).StatusCode -eq 200 } catch { }
    }
    if (-not $repond) {
        Write-Host "Attention : le logiciel ne répond pas encore. Consultez $Dossier\journaux\serveur.log" -ForegroundColor Yellow
        Afficher-EtatTache $NomTache
    }
    else { Ok "Le logiciel répond" }
}
Write-Host ""
Write-Host "  Mise à jour terminée : version $nouvelle." -ForegroundColor Green
Write-Host "  (Version précédente gardée dans $precedent ; sauvegarde : $fichierSauvegarde)" -ForegroundColor Gray
