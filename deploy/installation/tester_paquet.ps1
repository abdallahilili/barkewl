# RAQEEM PHARMA - test automatique du paquet COMPLET, à lancer avant chaque livraison.
#
#   powershell -ExecutionPolicy Bypass -File deploy\installation\tester_paquet.ps1
#
# Dans un dossier temporaire, sans droits administrateur et sans toucher à WampServer ni à une installation
# existante (mode -SansTache : MySQL et le serveur sont lancés comme simples programmes) :
#   1. installation complète (MySQL inclus) ;
#   2. vérifications : pages, connexion du propriétaire, mode production, hôte inconnu refusé, sauvegarde ;
#   3. mise à jour normale (ancienne configuration « HOTES_AUTORISES=* » remplacée) ;
#   4. mise à jour VOLONTAIREMENT CASSÉE : le retour automatique à la version précédente doit fonctionner ;
#   5. nettoyage complet.
# Affiche « TOUS LES TESTS SONT PASSÉS » ou la liste des échecs (code de sortie 1).
param(
    [string]$Paquet = ""
)
$ErrorActionPreference = "Continue"
$Racine = Resolve-Path (Join-Path $PSScriptRoot "..\..")
if (-not $Paquet) {
    $version = ([regex]::Match((Get-Content (Join-Path $Racine "backend\config\version.py") -Raw), 'VERSION\s*=\s*"([^"]+)"')).Groups[1].Value
    $Paquet = Join-Path $Racine "dist-installation\RaqeemPharma-$version"
}
if (-not (Test-Path (Join-Path $Paquet "mysql\bin\mysqld.exe"))) {
    Write-Host "Paquet complet introuvable : $Paquet (lancez d'abord construire_paquet.ps1)." -ForegroundColor Red
    exit 1
}
$essai = Join-Path $env:TEMP "raqeem-test-paquet"
$cible = Join-Path $essai "installation"
$motDePasse = "Essai-Raqeem-2026"
$portServeur = 8097
$echecs = New-Object System.Collections.Generic.List[string]

function Verifier($nom, [bool]$condition) {
    if ($condition) { Write-Host "  [OK]    $nom" -ForegroundColor Green }
    else { Write-Host "  [ECHEC] $nom" -ForegroundColor Red; $echecs.Add($nom) }
}
function Arreter-Tout {
    Get-CimInstance Win32_Process | Where-Object { $_.ExecutablePath -like "$essai*" } |
        ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
    Start-Sleep -Seconds 2
}
function Lancer-Serveur {
    $p = Start-Process -FilePath "$cible\python\python.exe" -WorkingDirectory "$cible\app\backend" -WindowStyle Hidden -PassThru `
        -ArgumentList "-m", "waitress", "--host=127.0.0.1", "--port=$portServeur", "config.wsgi:application"
    for ($i = 0; $i -lt 30; $i++) {
        Start-Sleep -Seconds 1
        try { if ((Invoke-WebRequest "http://127.0.0.1:$portServeur/api/licence/" -UseBasicParsing -TimeoutSec 3).StatusCode -eq 200) { break } } catch { }
    }
    return $p
}
function Repond($chemin, $hote = $null) {
    try {
        $entetes = @{}
        if ($hote) { $entetes["Host"] = $hote }
        return (Invoke-WebRequest "http://127.0.0.1:$portServeur$chemin" -Headers $entetes -UseBasicParsing -TimeoutSec 5).StatusCode
    } catch { return [int]$_.Exception.Response.StatusCode }
}
function Lancer-MysqlInclus {
    # Après un arrêt (mise à jour en mode test), le MySQL inclus est relancé comme simple programme.
    if (-not (Get-CimInstance Win32_Process -Filter "Name='mysqld.exe'" | Where-Object { $_.ExecutablePath -like "$essai*" })) {
        Start-Process "$cible\mysql\bin\mysqld.exe" -ArgumentList "--defaults-file=`"$cible\mysql.ini`"" -WindowStyle Hidden | Out-Null
        Start-Sleep -Seconds 6
    }
}

Arreter-Tout
if (Test-Path $essai) { Remove-Item -Recurse -Force $essai }
New-Item -ItemType Directory -Force -Path $essai | Out-Null
try {
    # ------------------------------------------------------------ 1. Installation
    Write-Host "==> 1. Installation (paquet complet, MySQL inclus)" -ForegroundColor Cyan
    $env:RAQEEM_ADMIN_MDP = $motDePasse
    # Port MySQL inutilisé : force l'installation du MySQL inclus, même si WampServer tourne sur ce PC.
    $journal = powershell -NoProfile -ExecutionPolicy Bypass -File "$Paquet\installer.ps1" -Dossier $cible -MysqlPort 3398 -SansTache -NonInteractif 2>&1 | Out-String
    $codeInstallation = $LASTEXITCODE
    Remove-Item Env:RAQEEM_ADMIN_MDP -ErrorAction SilentlyContinue
    Verifier "installation terminée sans erreur" ($codeInstallation -eq 0)
    if ($codeInstallation -ne 0) { Write-Host $journal; throw "installation en échec" }
    Verifier "MySQL inclus installé" ($journal -match "MySQL [\d.]+ install")

    # ------------------------------------------------------------ 2. Vérifications
    Write-Host "==> 2. Vérifications" -ForegroundColor Cyan
    $env_ = Get-Content "$cible\app\backend\.env"
    Verifier "mode production (DEBUG=0)" ($env_ -contains "DEBUG=0")
    Verifier "outils MySQL du paquet pour les sauvegardes" (($env_ -like "CHEMIN_MYSQL_BIN=*mysql\bin").Count -eq 1)
    Verifier "installation.json : version en texte" ((Get-Content "$cible\installation.json" -Raw | ConvertFrom-Json).version -is [string])
    Verifier "outil d'accès à la base installé" (Test-Path "$cible\Base_de_donnees.bat")
    $serveur = Lancer-Serveur
    Verifier "page d'accueil" ((Repond "/") -eq 200)
    Verifier "page interne (routage de l'interface)" ((Repond "/ventes/nouvelle") -eq 200)
    Verifier "API licence" ((Repond "/api/licence/") -eq 200)
    Verifier "nom d'hôte inconnu refusé" ((Repond "/api/licence/" "pirate.example") -eq 400)
    try {
        $jetons = Invoke-RestMethod -Method Post "http://127.0.0.1:$portServeur/api/auth/connexion/" -ContentType "application/json" `
            -Body (@{ identifiant = "admin"; mot_de_passe = $motDePasse } | ConvertTo-Json)
        Verifier "connexion du propriétaire" ([bool]$jetons.acces)
    } catch { Verifier "connexion du propriétaire" $false }
    Stop-Process -Id $serveur.Id -Force -ErrorAction SilentlyContinue
    Push-Location "$cible\app\backend"
    $sortie = & "$cible\python\python.exe" manage.py sauvegarder 2>&1 | Out-String
    Pop-Location
    Verifier "sauvegarde avec le mysqldump du paquet" ($sortie -match "\.sql\.gz")

    # ------------------------------------------------------------ 3. Mise à jour normale
    Write-Host "==> 3. Mise à jour" -ForegroundColor Cyan
    $fichierEnv = "$cible\app\backend\.env"
    $lignes = [IO.File]::ReadAllLines($fichierEnv) | Where-Object { $_ -notlike "HOTES_*" }
    [IO.File]::WriteAllLines($fichierEnv, [string[]]@($lignes + "HOTES_AUTORISES=*"), (New-Object Text.UTF8Encoding $false))
    $journal = powershell -NoProfile -ExecutionPolicy Bypass -File "$Paquet\mettre_a_jour.ps1" -Dossier $cible -SansTache 2>&1 | Out-String
    Verifier "mise à jour terminée sans erreur" ($LASTEXITCODE -eq 0 -and $journal -match "jour termin")   # sans accents : la console peut les déformer
    Verifier "ancienne configuration « * » remplacée" (-not ((Get-Content $fichierEnv) -contains "HOTES_AUTORISES=*"))
    Verifier "Python conservé pour un éventuel retour" (Test-Path "$cible\python.precedent\python.exe")
    Lancer-MysqlInclus
    $serveur = Lancer-Serveur
    Verifier "le logiciel répond après la mise à jour" ((Repond "/api/licence/") -eq 200)
    Stop-Process -Id $serveur.Id -Force -ErrorAction SilentlyContinue

    # ------------------------------------------------------------ 4. Mise à jour cassée -> retour automatique
    Write-Host "==> 4. Mise à jour cassée (retour automatique attendu)" -ForegroundColor Cyan
    $casse = Join-Path $essai "paquet-casse"
    robocopy $Paquet $casse /MIR /NFL /NDL /NJH /NJS /NP /XD mysql outils | Out-Null
    Set-Content "$casse\VERSION.txt" "9.9.9-casse" -Encoding ASCII
    Add-Content "$casse\app\backend\config\settings.py" "`nraise RuntimeError('mise a jour volontairement cassee (test)')" -Encoding UTF8
    $versionAvant = (Get-Content "$cible\VERSION.txt" | Select-Object -First 1)
    $journal = powershell -NoProfile -ExecutionPolicy Bypass -File "$casse\mettre_a_jour.ps1" -Dossier $cible -SansTache 2>&1 | Out-String
    Verifier "la mise à jour cassée est détectée" ($LASTEXITCODE -ne 0 -and $journal -match "Retour automatique")
    Verifier "la version précédente est conservée" ((Get-Content "$cible\VERSION.txt" | Select-Object -First 1) -eq $versionAvant)
    Verifier "le code cassé a été retiré" (-not (Select-String -Path "$cible\app\backend\config\settings.py" -Pattern "volontairement cassee" -Quiet))
    Lancer-MysqlInclus
    $serveur = Lancer-Serveur
    Verifier "le logiciel répond après le retour automatique" ((Repond "/api/licence/") -eq 200)
    Stop-Process -Id $serveur.Id -Force -ErrorAction SilentlyContinue
}
catch { Verifier "déroulement du test ($($_.Exception.Message))" $false }
finally {
    # ------------------------------------------------------------ 5. Nettoyage
    Arreter-Tout
    Remove-Item -Recurse -Force $essai -ErrorAction SilentlyContinue
}

Write-Host ""
if ($echecs.Count -eq 0) { Write-Host "TOUS LES TESTS SONT PASSÉS" -ForegroundColor Green; exit 0 }
Write-Host "$($echecs.Count) ÉCHEC(S) :" -ForegroundColor Red
$echecs | ForEach-Object { Write-Host "  - $_" -ForegroundColor Red }
exit 1
