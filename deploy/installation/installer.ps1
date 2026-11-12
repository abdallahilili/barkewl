# RAQEEM PHARMA - installation chez le client (Rawafid Digital Services).
# Lancé par « Installer.bat » (en administrateur). Compatible Windows PowerShell 5.1.
#
# Ce que fait l'installation :
#   1. Python : installe la version fournie dans le paquet (dossier prerequis), ou utilise -Python
#   2. Copie le logiciel dans le dossier d'installation (par défaut C:\RaqeemPharma)
#   3. Installe les composants Python hors ligne (dossier paquets)
#   4. Crée la base MySQL et un compte MySQL dédié au logiciel (mot de passe aléatoire)
#   5. Écrit la configuration (.env) : mode production, clé secrète aléatoire, sauvegardes
#   6. Prépare la base (tables InnoDB) et crée le compte du propriétaire
#   7. Démarrage automatique avec Windows (tâche planifiée) + raccourci sur le bureau
#   8. Vérifie que tout répond et affiche le code du PC pour la licence
param(
    [string]$Dossier = "C:\RaqeemPharma",
    [int]$Port = 8080,
    [string]$Python = "",
    [string]$MysqlHote = "127.0.0.1",
    [int]$MysqlPort = 3306,
    [string]$MysqlAdmin = "root",
    [string]$BdNom = "raqeem",
    [string]$BdUtilisateur = "raqeem",
    [switch]$Reseau,            # plusieurs postes : le serveur accepte les connexions du réseau local
    [switch]$SansTache,         # tests : pas de tâche planifiée, de raccourci ni de pare-feu
    [switch]$NonInteractif      # tests : mots de passe lus dans RAQEEM_MYSQL_ADMIN_MDP et RAQEEM_ADMIN_MDP
)
$ErrorActionPreference = "Stop"
$Paquet = Split-Path -Parent $MyInvocation.MyCommand.Path
$NomTache = "RaqeemPharma"

function Titre($texte) { Write-Host ""; Write-Host "==> $texte" -ForegroundColor Cyan }
function Ok($texte) { Write-Host "    OK  $texte" -ForegroundColor Green }
function Echec($texte) { Write-Host ""; Write-Host "ERREUR : $texte" -ForegroundColor Red; Write-Host "L'installation est interrompue. Rien n'a été démarré." -ForegroundColor Red; exit 1 }
function Read-Secret($question) {
    $s = Read-Host -AsSecureString $question
    return [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($s))
}
function Executer($exe, [string[]]$arguments, $message) {
    & $exe @arguments
    if ($LASTEXITCODE -ne 0) { Echec $message }
}

Write-Host ""
Write-Host "  =====================================================" -ForegroundColor DarkCyan
Write-Host "    RAQEEM PHARMA  -  Installation" -ForegroundColor White
Write-Host "    Rawafid Digital Services" -ForegroundColor Gray
Write-Host "  =====================================================" -ForegroundColor DarkCyan
$version = (Get-Content (Join-Path $Paquet "VERSION.txt") -ErrorAction SilentlyContinue | Select-Object -First 1)
Write-Host "    Version $version  ->  $Dossier" -ForegroundColor Gray

if (-not $SansTache) {
    $admin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
    if (-not $admin) { Echec "Lancez « Installer.bat » par clic droit > Exécuter en tant qu'administrateur." }
}
if (Test-Path (Join-Path $Dossier "app\backend\.env")) {
    Echec "RAQEEM PHARMA est déjà installé dans $Dossier. Pour une nouvelle version, utilisez « Mettre_a_jour.bat »."
}

# ---------------------------------------------------------------- 1. Python
Titre "1/8  Python"
if (-not $Python) {
    $Python = Join-Path $Dossier "python\python.exe"
    if (-not (Test-Path $Python)) {
        $installateur = Get-ChildItem (Join-Path $Paquet "prerequis") -Filter "python-*-amd64.exe" -ErrorAction SilentlyContinue | Select-Object -First 1
        if (-not $installateur) { Echec "Installateur Python introuvable dans le dossier « prerequis » du paquet." }
        Write-Host "    Installation de $($installateur.Name) (1 à 2 minutes)..."
        $p = Start-Process -FilePath $installateur.FullName -Wait -PassThru -ArgumentList @(
            "/quiet", "InstallAllUsers=1", "PrependPath=0", "Include_launcher=0", "Include_test=0", "Include_doc=0",
            "Shortcuts=0", "AssociateFiles=0", "TargetDir=`"$(Join-Path $Dossier 'python')`"")
        if ($p.ExitCode -ne 0 -or -not (Test-Path $Python)) { Echec "L'installation de Python a échoué (code $($p.ExitCode))." }
    }
}
if (-not (Test-Path $Python)) { Echec "Python introuvable : $Python" }
Ok (& $Python --version)

# ---------------------------------------------------------------- 2. Copie du logiciel
Titre "2/8  Copie du logiciel"
New-Item -ItemType Directory -Force -Path (Join-Path $Dossier "app"), (Join-Path $Dossier "sauvegardes"), (Join-Path $Dossier "journaux") | Out-Null
robocopy (Join-Path $Paquet "app\backend") (Join-Path $Dossier "app\backend") /MIR /NFL /NDL /NJH /NJS /NP /XD __pycache__ | Out-Null
if ($LASTEXITCODE -ge 8) { Echec "Copie du serveur impossible." }
robocopy (Join-Path $Paquet "app\interface") (Join-Path $Dossier "app\interface") /MIR /NFL /NDL /NJH /NJS /NP | Out-Null
if ($LASTEXITCODE -ge 8) { Echec "Copie de l'interface impossible." }
Copy-Item (Join-Path $Paquet "VERSION.txt") (Join-Path $Dossier "VERSION.txt") -Force
Ok "Logiciel copié dans $Dossier\app"

# ---------------------------------------------------------------- 3. Composants Python
Titre "3/8  Composants Python (hors ligne)"
$venv = Join-Path $Dossier "venv"
if (-not (Test-Path (Join-Path $venv "Scripts\python.exe"))) { Executer $Python @("-m", "venv", $venv) "Création de l'environnement Python impossible." }
$py = Join-Path $venv "Scripts\python.exe"
Executer $py @("-m", "pip", "install", "--quiet", "--no-index", "--find-links", (Join-Path $Paquet "paquets"),
    "-r", (Join-Path $Paquet "requirements-installation.txt")) "Installation des composants Python impossible."
Ok "Composants installés"

# ---------------------------------------------------------------- 4. Base MySQL
Titre "4/8  Base de données MySQL"
Write-Host "    Le serveur MySQL (WampServer, MySQL ou MariaDB) doit être démarré sur ${MysqlHote}:${MysqlPort}."
if ($NonInteractif) { $mdpAdminMysql = $env:RAQEEM_MYSQL_ADMIN_MDP }
else { $mdpAdminMysql = Read-Secret "    Mot de passe MySQL de « $MysqlAdmin » (vide sous WampServer par défaut)" }
$mdpBd = (& $py (Join-Path $Paquet "outils_installation.py") mot_de_passe).Trim()
$env:RAQEEM_MYSQL_HOTE = $MysqlHote; $env:RAQEEM_MYSQL_PORT = "$MysqlPort"; $env:RAQEEM_MYSQL_ADMIN = $MysqlAdmin
$env:RAQEEM_MYSQL_ADMIN_MDP = $mdpAdminMysql; $env:RAQEEM_BD_NOM = $BdNom; $env:RAQEEM_BD_UTILISATEUR = $BdUtilisateur; $env:RAQEEM_BD_MDP = $mdpBd
& $py (Join-Path $Paquet "outils_installation.py") base
$codeBase = $LASTEXITCODE
Remove-Item Env:RAQEEM_MYSQL_ADMIN_MDP, Env:RAQEEM_BD_MDP -ErrorAction SilentlyContinue
if ($codeBase -ne 0) { Echec "Vérifiez que MySQL est démarré et que le mot de passe est correct." }
Ok "Base « $BdNom » prête (compte dédié « $BdUtilisateur »)"

# ---------------------------------------------------------------- 5. Configuration
Titre "5/8  Configuration"
$cle = (& $py (Join-Path $Paquet "outils_installation.py") cle).Trim()
$fichierEnv = Join-Path $Dossier "app\backend\.env"
$lignesEnv = @(
    "# RAQEEM PHARMA - configuration de ce poste (générée par l'installation le $(Get-Date -Format 'yyyy-MM-dd HH:mm'))",
    "DEBUG=0",
    "CLE_SECRETE=$cle",
    "HOTES_AUTORISES=*",
    "ORIGINES_CORS=http://localhost:$Port,http://127.0.0.1:$Port",
    "BD_NOM=$BdNom", "BD_UTILISATEUR=$BdUtilisateur", "BD_MOT_DE_PASSE=$mdpBd", "BD_HOTE=$MysqlHote", "BD_PORT=$MysqlPort",
    "UTILISER_SQLITE=0",
    "DOSSIER_INTERFACE=$(Join-Path $Dossier 'app\interface')",
    "DOSSIER_SAUVEGARDES=$(Join-Path $Dossier 'sauvegardes')",
    "# Copie de secours conseillée : clé USB, autre disque ou dossier OneDrive",
    "DOSSIER_SAUVEGARDES_COPIE=",
    "SAUVEGARDE_INTERVALLE_HEURES=6",
    "SAUVEGARDES_JOURS_CONSERVATION=30"
)
# UTF-8 sans BOM : la marque BOM de PowerShell 5.1 gênerait la lecture de la première ligne.
[IO.File]::WriteAllLines($fichierEnv, $lignesEnv, (New-Object Text.UTF8Encoding $false))
if (-not $SansTache) {
    # Fichier lisible seulement par les administrateurs et le système (il contient le mot de passe MySQL).
    icacls $fichierEnv /inheritance:r /grant:r "*S-1-5-32-544:F" "*S-1-5-18:F" | Out-Null
}
Ok "Configuration écrite (mode production, clé secrète aléatoire)"

# ---------------------------------------------------------------- 6. Base de données et propriétaire
Titre "6/8  Préparation de la base"
Push-Location (Join-Path $Dossier "app\backend")
try {
    Executer $py @("manage.py", "migrate", "--noinput", "-v", "0") "Préparation de la base impossible."
    Ok "Tables créées (InnoDB)"
    Write-Host "    Compte du PROPRIÉTAIRE (identifiant : admin)."
    if ($NonInteractif) { $mdpAdmin = $env:RAQEEM_ADMIN_MDP }
    else {
        do {
            $mdpAdmin = Read-Secret "    Choisissez son mot de passe (8 caractères minimum)"
            $confirmation = Read-Secret "    Confirmez le mot de passe"
            if ($mdpAdmin -ne $confirmation) { Write-Host "    Les deux mots de passe sont différents." -ForegroundColor Yellow }
            elseif ($mdpAdmin.Length -lt 8) { Write-Host "    8 caractères minimum." -ForegroundColor Yellow }
        } while ($mdpAdmin -ne $confirmation -or $mdpAdmin.Length -lt 8)
    }
    Executer $py @("manage.py", "initialiser_donnees", "--identifiant", "admin", "--mot-de-passe", $mdpAdmin) "Création du compte propriétaire impossible."
    Ok "Compte « admin » créé, dépôts, caisse et modes de paiement prêts"
} finally { Pop-Location }

# ---------------------------------------------------------------- 7. Démarrage automatique
Titre "7/8  Démarrage automatique"
$hote = "127.0.0.1"
if ($Reseau) { $hote = "0.0.0.0" }
$demarrer = Join-Path $Dossier "demarrer_serveur.bat"
@(
    "@echo off",
    "REM RAQEEM PHARMA - serveur (lancé au démarrage de Windows par la tâche $NomTache)",
    "cd /d `"$(Join-Path $Dossier 'app\backend')`"",
    "`"$(Join-Path $venv 'Scripts\waitress-serve.exe')`" --host=$hote --port=$Port --threads=8 config.wsgi:application >> `"$(Join-Path $Dossier 'journaux\serveur.log')`" 2>&1"
) | Set-Content -Path $demarrer -Encoding ASCII
if ($SansTache) {
    Ok "Mode test : pas de tâche planifiée"
} else {
    schtasks /create /tn $NomTache /tr "`"$demarrer`"" /sc onstart /ru SYSTEM /rl HIGHEST /f | Out-Null
    if ($LASTEXITCODE -ne 0) { Echec "Création de la tâche de démarrage impossible." }
    schtasks /run /tn $NomTache | Out-Null
    Ok "Le logiciel démarre automatiquement avec Windows (tâche « $NomTache »)"
    if ($Reseau) {
        netsh advfirewall firewall add rule name="RAQEEM PHARMA" dir=in action=allow protocol=TCP localport=$Port | Out-Null
        Ok "Pare-feu ouvert sur le port $Port pour les autres postes"
    }
    $raccourci = Join-Path ([Environment]::GetFolderPath("CommonDesktopDirectory")) "RAQEEM PHARMA.url"
    @("[InternetShortcut]", "URL=http://localhost:$Port/") | Set-Content -Path $raccourci -Encoding ASCII
    Ok "Raccourci « RAQEEM PHARMA » sur le bureau"
}

# ---------------------------------------------------------------- 8. Vérification
Titre "8/8  Vérification"
@{ version = $version; dossier = $Dossier; port = $Port; reseau = [bool]$Reseau; base = $BdNom; installe_le = (Get-Date -Format "s") } |
    ConvertTo-Json | Set-Content -Path (Join-Path $Dossier "installation.json") -Encoding UTF8
if (-not $SansTache) {
    $repond = $false
    for ($i = 0; $i -lt 30 -and -not $repond; $i++) {
        Start-Sleep -Seconds 2
        try { $repond = (Invoke-WebRequest "http://127.0.0.1:$Port/api/licence/" -UseBasicParsing -TimeoutSec 3).StatusCode -eq 200 } catch { }
    }
    if (-not $repond) { Echec "Le logiciel ne répond pas. Consultez $Dossier\journaux\serveur.log" }
    Ok "Le logiciel répond sur http://localhost:$Port"
}
Push-Location (Join-Path $Dossier "app\backend")
$ligneCode = & $py manage.py licence 2>$null | Select-String "Code du PC" | Select-Object -First 1
$codePc = "(voir Paramètres > Licence)"
if ($ligneCode) { $codePc = $ligneCode.ToString().Split(":")[-1].Trim() }
Pop-Location

Write-Host ""
Write-Host "  =====================================================" -ForegroundColor Green
Write-Host "    Installation terminée" -ForegroundColor Green
Write-Host "  =====================================================" -ForegroundColor Green
Write-Host "    Adresse        : http://localhost:$Port"
Write-Host "    Compte         : admin (mot de passe choisi à l'étape 6)"
Write-Host "    CODE DU PC     : $codePc" -ForegroundColor Yellow
Write-Host "    -> Envoyez ce code à Rawafid Digital Services pour recevoir la licence,"
Write-Host "       puis collez la clé dans Paramètres > Licence."
if (-not $SansTache) { Start-Process "http://localhost:$Port/" }
