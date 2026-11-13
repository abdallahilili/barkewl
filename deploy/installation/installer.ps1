# RAQEEM PHARMA - installation chez le client (Rawafid Digital Services).
# Lancé par « Installer.bat » (en administrateur). Compatible Windows PowerShell 5.1.
#
# Ce que fait l'installation :
#   1. Python embarqué (copié tel quel : n'interfère avec aucun Python déjà installé sur le PC)
#   2. Copie le logiciel dans le dossier d'installation (par défaut C:\RaqeemPharma)
#   3. Copie les composants Python (dossier lib, déjà préparés dans le paquet)
#   4. Crée la base MySQL et un compte MySQL dédié au logiciel (mot de passe aléatoire)
#   5. Écrit la configuration (.env) : mode production, clé secrète aléatoire, sauvegardes
#   6. Prépare la base (tables InnoDB) et crée le compte du propriétaire
#   7. Démarrage automatique avec Windows (tâche planifiée) + raccourci sur le bureau
#   8. Vérifie que tout répond et affiche le code du PC pour la licence
param(
    [string]$Dossier = "C:\RaqeemPharma",
    [int]$Port = 8080,
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
try { [Console]::OutputEncoding = [Text.Encoding]::UTF8 } catch { }
$Paquet = Split-Path -Parent $MyInvocation.MyCommand.Path
$NomTache = "RaqeemPharma"

function Titre($texte) { Write-Host ""; Write-Host "==> $texte" -ForegroundColor Cyan }
function Ok($texte) { Write-Host "    OK  $texte" -ForegroundColor Green }
function Echec($texte) { Write-Host ""; Write-Host "ERREUR : $texte" -ForegroundColor Red; Write-Host "L'installation est interrompue. Rien n'a été démarré." -ForegroundColor Red; exit 1 }
function Read-Secret($question) {
    $s = Read-Host -AsSecureString $question
    $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($s)
    try { return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr) }
    finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr); $s.Dispose() }   # efface la copie en mémoire
}
# Programmes externes (python, robocopy…) : seul leur code de sortie compte. Sous PowerShell 5.1, avec
# « Stop », un simple message d'information écrit sur la sortie d'erreur interromprait le script.
# Python embarqué : ses chemins de recherche sont fixés par le fichier python3XX._pth (variables
# d'environnement ignorées). On y ajoute les composants (lib) et le serveur (app\backend).
function Write-CheminsPython($dossierInstallation) {
    $pth = Get-ChildItem (Join-Path $dossierInstallation "python") -Filter "python3*._pth" | Select-Object -First 1
    if (-not $pth) { throw "Fichier ._pth du Python embarqué introuvable." }
    $zip = (Get-ChildItem (Join-Path $dossierInstallation "python") -Filter "python3*.zip" | Select-Object -First 1).Name
    $lignes = @($zip, ".", (Join-Path $dossierInstallation "lib"), (Join-Path $dossierInstallation "app\backend"))
    [IO.File]::WriteAllLines($pth.FullName, $lignes, (New-Object Text.UTF8Encoding $false))
}
# Tâche de démarrage du serveur. Pas « schtasks /create » : ses réglages par défaut empêchent le démarrage
# d'un PC portable sur batterie et arrêtent le serveur au bout de 72 heures.
function Enregistrer-Tache($nom, $bat) {
    $action = New-ScheduledTaskAction -Execute "cmd.exe" -Argument "/c `"$bat`""
    $declencheur = New-ScheduledTaskTrigger -AtStartup
    $principal = New-ScheduledTaskPrincipal -UserId "SYSTEM" -LogonType ServiceAccount -RunLevel Highest
    $reglages = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable `
        -ExecutionTimeLimit ([TimeSpan]::Zero) -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) -MultipleInstances IgnoreNew
    Register-ScheduledTask -TaskName $nom -Action $action -Trigger $declencheur -Principal $principal -Settings $reglages -Force | Out-Null
}
# Diagnostic affiché si le serveur ne répond pas.
function Afficher-EtatTache($nom) {
    $info = Get-ScheduledTaskInfo -TaskName $nom -ErrorAction SilentlyContinue
    $tache = Get-ScheduledTask -TaskName $nom -ErrorAction SilentlyContinue
    if ($tache) { Write-Host "      Tâche : état $($tache.State), dernier lancement $($info.LastRunTime), résultat 0x$('{0:X}' -f $info.LastTaskResult)" }
    else { Write-Host "      Tâche « $nom » introuvable." }
    $batterie = Get-CimInstance Win32_Battery -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($batterie) { Write-Host "      Batterie : $($batterie.EstimatedChargeRemaining) % (statut $($batterie.BatteryStatus) ; 2 = sur secteur)" }
}
# Démarrage automatique de MySQL avec Windows. WampServer installe MySQL / MariaDB comme service Windows
# en démarrage « manuel » : sans ouvrir WampServer, le logiciel n'aurait pas de base. On retrouve le service
# qui écoute sur le port de la base et on le passe en démarrage automatique.
function Trouver-ServiceMysql([int]$portBase) {
    $services = @(Get-CimInstance Win32_Service -ErrorAction SilentlyContinue | Where-Object { $_.PathName -match "mysqld|mariadbd" })
    # 1) le service dont le processus écoute sur le port de la base
    $pids = @(Get-NetTCPConnection -LocalPort $portBase -State Listen -ErrorAction SilentlyContinue | ForEach-Object { $_.OwningProcess })
    $service = $services | Where-Object { $pids -contains $_.ProcessId } | Select-Object -First 1
    # 2) sinon, le service dont le fichier my.ini (dossier de sa version, comme dans WampServer) indique ce port
    return $service
}
function Activer-DemarrageMysql([int]$portBase) {
    $service = Trouver-ServiceMysql $portBase
    if (-not $service) {
        $service = $services | Where-Object {
            $exe = ($_.PathName -replace '^"([^"]+)".*$', '$1') -replace '^(\S+\.exe).*$', '$1'
            $ini = Join-Path (Split-Path (Split-Path $exe)) "my.ini"
            (Test-Path $ini) -and (Select-String -Path $ini -Pattern "^\s*port\s*=\s*$portBase\s*$" -Quiet)
        } | Select-Object -First 1
    }
    if (-not $service) {
        Write-Host "    Attention : service MySQL non trouvé. Lancez WampServer au démarrage de Windows." -ForegroundColor Yellow
        return
    }
    if ($service.StartMode -ne "Auto") { Set-Service -Name $service.Name -StartupType Automatic -ErrorAction Stop }
    Ok "MySQL démarre automatiquement avec Windows (service « $($service.Name) »), sans ouvrir WampServer"
}
$NomServiceMysql = "RaqeemMySQL"
function Attendre-Port([int]$numero, [int]$secondes) {
    for ($i = 0; $i -lt $secondes; $i++) {
        if (Get-NetTCPConnection -LocalPort $numero -State Listen -ErrorAction SilentlyContinue) { return $true }
        Start-Sleep -Seconds 1
    }
    return $false
}
# MySQL inclus dans le paquet complet : installé comme service Windows « RaqeemMySQL » (démarrage automatique),
# données dans <dossier>\donnees_mysql, mot de passe root aléatoire dans <dossier>\mysql_root.txt (administrateurs).
function Installer-MysqlInclus {
    Write-Host "    Aucun MySQL sur ce PC : installation du MySQL inclus dans le paquet (aucune question)."
    # Moteur Visual C++ de Microsoft, nécessaire à MySQL (souvent déjà présent).
    $dll = Join-Path $env:WINDIR "System32\msvcp140.dll"
    $vcOk = $false
    if (Test-Path $dll) { try { $vcOk = [version]((Get-Item $dll).VersionInfo.FileVersion.Split(" ")[0]) -ge [version]"14.38" } catch { } }
    if (-not $vcOk) {
        Write-Host "    Installation du moteur Visual C++ (Microsoft)..."
        $p = Start-Process (Join-Path $Paquet "vc_redist.x64.exe") -ArgumentList "/install", "/quiet", "/norestart" -Wait -PassThru
        if ($p.ExitCode -notin 0, 1638, 3010) { Echec "Installation du moteur Visual C++ impossible (code $($p.ExitCode))." }
    }
    # Port : 3306 sauf s'il est pris ou interdit.
    $script:MysqlPort = $null
    foreach ($candidat in 3306, 3307, 3308, 3316) {
        Natif { & $py -c "import socket; s = socket.socket(); s.bind(('127.0.0.1', $candidat)); s.close()" 2>$null } | Out-Null
        if ($LASTEXITCODE -eq 0) { $script:MysqlPort = $candidat; break }
    }
    if (-not $script:MysqlPort) { Echec "Aucun port disponible pour MySQL (3306, 3307, 3308, 3316)." }
    $dossierMysql = Join-Path $Dossier "mysql"
    $donnees = Join-Path $Dossier "donnees_mysql"
    robocopy (Join-Path $Paquet "mysql") $dossierMysql /MIR /NFL /NDL /NJH /NJS /NP | Out-Null
    if ($LASTEXITCODE -ge 8) { Echec "Copie de MySQL impossible." }
    $ini = Join-Path $Dossier "mysql.ini"
    @(
        "# MySQL de RAQEEM PHARMA (genere par l'installation)",
        "[mysqld]",
        "basedir=$($dossierMysql -replace '\\', '/')",
        "datadir=$($donnees -replace '\\', '/')",
        "port=$($script:MysqlPort)",
        "bind-address=127.0.0.1",
        "mysqlx=OFF",
        "default-storage-engine=INNODB",
        "innodb_default_row_format=DYNAMIC",
        "innodb_buffer_pool_size=256M",
        "max_connections=60",
        "log-error=$((Join-Path $Dossier 'journaux\mysql.err') -replace '\\', '/')",
        "[client]",
        "port=$($script:MysqlPort)"
    ) | Set-Content -Path $ini -Encoding ASCII
    if (-not (Test-Path (Join-Path $donnees "mysql.ibd"))) {
        if (Test-Path $donnees) { Remove-Item -Recurse -Force $donnees }   # initialisation précédente incomplète
        Executer (Join-Path $dossierMysql "bin\mysqld.exe") @("--defaults-file=$ini", "--initialize-insecure") "Initialisation de MySQL impossible (voir journaux\mysql.err)."
    }
    if ($SansTache) {
        # Tests sans droits administrateur : MySQL lancé comme simple programme.
        Start-Process (Join-Path $dossierMysql "bin\mysqld.exe") -ArgumentList "--defaults-file=`"$ini`"" -WindowStyle Hidden | Out-Null
    } else {
        Executer (Join-Path $dossierMysql "bin\mysqld.exe") @("--install", $NomServiceMysql, "--defaults-file=$ini") "Installation du service MySQL impossible."
        Set-Service -Name $NomServiceMysql -StartupType Automatic
        Start-Service -Name $NomServiceMysql
    }
    if (-not (Attendre-Port $script:MysqlPort 60)) { Echec "MySQL ne démarre pas (voir $Dossier\journaux\mysql.err)." }
    Ok "MySQL $((Get-Item (Join-Path $dossierMysql 'bin\mysqld.exe')).VersionInfo.ProductVersion) installé (port $($script:MysqlPort), démarrage automatique avec Windows)"
}
function Natif([scriptblock]$bloc) { $ErrorActionPreference = "Continue"; & $bloc }
function Executer($exe, [string[]]$arguments, $message) {
    Natif { & $exe @arguments }
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
if (Test-Path (Join-Path $Dossier "installation.json")) {
    Echec "RAQEEM PHARMA est déjà installé dans $Dossier. Pour une nouvelle version, utilisez « Mettre_a_jour.bat »."
}
if (Test-Path (Join-Path $Dossier "app\backend\.env")) {
    # installation.json n'est écrit qu'à la toute fin : une installation précédente s'est arrêtée en route.
    Write-Host "    Installation précédente incomplète détectée : elle est reprise." -ForegroundColor Yellow
    Remove-Item (Join-Path $Dossier "app\backend\.env") -Force
    if (-not $SansTache) { Natif { schtasks /end /tn $NomTache 2>$null } | Out-Null }   # serveur resté lancé
}

# ---------------------------------------------------------------- 1. Python
Titre "1/8  Python"
# Python « embarqué » officiel (python.org) : simple copie de fichiers, sans installateur ni registre.
# Indépendant de tout autre Python présent sur le PC (l'installateur classique, lui, réutilise un Python
# 3.12 existant et ignore le dossier demandé).
New-Item -ItemType Directory -Force -Path $Dossier | Out-Null
robocopy (Join-Path $Paquet "python") (Join-Path $Dossier "python") /MIR /NFL /NDL /NJH /NJS /NP | Out-Null
if ($LASTEXITCODE -ge 8) { Echec "Copie de Python impossible." }
$py = Join-Path $Dossier "python\python.exe"
Ok (Natif { & $py --version })

# Port du logiciel : certains PC interdisent des ports (réservés par Windows pour Hyper-V / WSL / Docker,
# ou pris par un autre logiciel ; erreur 10013). On vérifie réellement l'accès et, si le port n'a pas été
# imposé, on prend le premier port libre de la liste.
$adresseEcoute = "127.0.0.1"
if ($Reseau) { $adresseEcoute = "0.0.0.0" }
function Test-PortLibre([int]$numero) {
    Natif { & $py -c "import socket; s = socket.socket(); s.bind(('$adresseEcoute', $numero)); s.close()" 2>$null } | Out-Null
    return ($LASTEXITCODE -eq 0)
}
if ($PSBoundParameters.ContainsKey("Port")) {
    if (-not (Test-PortLibre $Port)) { Echec "Le port $Port est interdit ou déjà utilisé sur ce PC. Relancez sans « -Port » (choix automatique)." }
} else {
    $Port = $null
    foreach ($candidat in 8080, 8765, 8090, 9080, 18080, 28080) { if (Test-PortLibre $candidat) { $Port = $candidat; break } }
    if (-not $Port) { Echec "Aucun port disponible pour le logiciel (8080, 8765, 8090, 9080, 18080, 28080)." }
}
Ok "Port du logiciel : $Port"

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
robocopy (Join-Path $Paquet "lib") (Join-Path $Dossier "lib") /MIR /NFL /NDL /NJH /NJS /NP | Out-Null
if ($LASTEXITCODE -ge 8) { Echec "Copie des composants Python impossible." }
Write-CheminsPython $Dossier
$verification = Natif { & $py -c "import django, rest_framework, pymysql, waitress; print('Django', django.get_version())" }
if ($LASTEXITCODE -ne 0) { Echec "Composants Python incomplets." }
Ok "Composants prêts ($verification)"

# ---------------------------------------------------------------- 4. Base MySQL
Titre "4/8  Base de données MySQL"
$fichierRoot = Join-Path $Dossier "mysql_root.txt"
$mysqlInclus = $false
$surCePc = $MysqlHote -in "127.0.0.1", "localhost"
if ($surCePc -and (Get-Service $NomServiceMysql -ErrorAction SilentlyContinue)) {
    # Reprise : le MySQL inclus a déjà été installé par une installation interrompue.
    Start-Service -Name $NomServiceMysql -ErrorAction SilentlyContinue
    $MysqlPort = [int]((Get-Content (Join-Path $Dossier "mysql.ini") | Where-Object { $_ -like "port=*" } | Select-Object -First 1).Substring(5))
    if (-not (Attendre-Port $MysqlPort 60)) { Echec "Le MySQL de RAQEEM PHARMA ne démarre pas (voir $Dossier\journaux\mysql.err)." }
    $mysqlInclus = $true
} elseif ($surCePc -and -not (Get-NetTCPConnection -LocalPort $MysqlPort -State Listen -ErrorAction SilentlyContinue)) {
    # Rien n'écoute : un MySQL existant (WampServer fermé) est démarré ; sinon, le MySQL du paquet est installé.
    $existant = Trouver-ServiceMysql $MysqlPort
    if ($existant) {
        Write-Host "    Démarrage du service MySQL « $($existant.Name) »..."
        Start-Service -Name $existant.Name -ErrorAction SilentlyContinue
        if (-not (Attendre-Port $MysqlPort 60)) { Echec "Le service MySQL « $($existant.Name) » ne démarre pas. Démarrez WampServer puis relancez l'installation." }
    } elseif (Test-Path (Join-Path $Paquet "mysql\bin\mysqld.exe")) {
        Installer-MysqlInclus
        $mysqlInclus = $true
    } else {
        Echec "Aucun MySQL sur ce PC. Démarrez WampServer, ou utilisez le paquet COMPLET (RaqeemPharma-$version-complet.zip) qui installe MySQL."
    }
}
if ($mysqlInclus) {
    $MysqlAdmin = "root"
    if (Test-Path $fichierRoot) { $mdpAdminMysql = (Get-Content $fichierRoot | Select-Object -First 1).Trim() }
    else {
        $mdpAdminMysql = (Natif { & $py (Join-Path $Paquet "outils_installation.py") mot_de_passe }).Trim()
        [IO.File]::WriteAllLines($fichierRoot, @($mdpAdminMysql, "# Mot de passe root du MySQL de RAQEEM PHARMA (port $MysqlPort). Ne pas diffuser."), (New-Object Text.UTF8Encoding $false))
        if (-not $SansTache) { icacls $fichierRoot /inheritance:r /grant:r "*S-1-5-32-544:F" "*S-1-5-18:F" | Out-Null }
    }
    $env:RAQEEM_MYSQL_PORT = "$MysqlPort"; $env:RAQEEM_MYSQL_ROOT_MDP = $mdpAdminMysql
    Natif { & $py (Join-Path $Paquet "outils_installation.py") root }
    $codeRoot = $LASTEXITCODE
    Remove-Item Env:RAQEEM_MYSQL_ROOT_MDP -ErrorAction SilentlyContinue
    if ($codeRoot -ne 0) { Echec "Sécurisation du MySQL inclus impossible." }
} else {
    Write-Host "    Le serveur MySQL (WampServer, MySQL ou MariaDB) doit être démarré sur ${MysqlHote}:${MysqlPort}."
    if ($NonInteractif) { $mdpAdminMysql = $env:RAQEEM_MYSQL_ADMIN_MDP }
    else { $mdpAdminMysql = Read-Secret "    Mot de passe MySQL de « $MysqlAdmin » (vide sous WampServer par défaut)" }
}
$mdpBd = (Natif { & $py (Join-Path $Paquet "outils_installation.py") mot_de_passe }).Trim()
$env:RAQEEM_MYSQL_HOTE = $MysqlHote; $env:RAQEEM_MYSQL_PORT = "$MysqlPort"; $env:RAQEEM_MYSQL_ADMIN = $MysqlAdmin
$env:RAQEEM_MYSQL_ADMIN_MDP = $mdpAdminMysql; $env:RAQEEM_BD_NOM = $BdNom; $env:RAQEEM_BD_UTILISATEUR = $BdUtilisateur; $env:RAQEEM_BD_MDP = $mdpBd
Natif { & $py (Join-Path $Paquet "outils_installation.py") base }
$codeBase = $LASTEXITCODE
Remove-Item Env:RAQEEM_MYSQL_ADMIN_MDP, Env:RAQEEM_BD_MDP -ErrorAction SilentlyContinue
if ($codeBase -ne 0) { Echec "Base de données non préparée : voir le message ci-dessus (MySQL démarré ? mot de passe correct ?)." }
Ok "Base « $BdNom » prête (compte dédié « $BdUtilisateur »)"

# ---------------------------------------------------------------- 5. Configuration
Titre "5/8  Configuration"
$cle = (Natif { & $py (Join-Path $Paquet "outils_installation.py") cle }).Trim()
$fichierEnv = Join-Path $Dossier "app\backend\.env"
$lignesEnv = @(
    "# RAQEEM PHARMA - configuration de ce poste (générée par l'installation le $(Get-Date -Format 'yyyy-MM-dd HH:mm'))",
    "DEBUG=0",
    "CLE_SECRETE=$cle",
    # Ce PC uniquement (nom, localhost). En mode plusieurs postes, le serveur ajoute à chaque démarrage
    # le nom réseau et les adresses IP actuelles de ce PC (HOTES_RESEAU_LOCAL).
    "HOTES_AUTORISES=localhost,127.0.0.1,$env:COMPUTERNAME",
    "HOTES_RESEAU_LOCAL=$(if ($Reseau) { '1' } else { '0' })",
    "ORIGINES_CORS=http://localhost:$Port,http://127.0.0.1:$Port",
    "BD_NOM=$BdNom", "BD_UTILISATEUR=$BdUtilisateur", "BD_MOT_DE_PASSE=$mdpBd", "BD_HOTE=$MysqlHote", "BD_PORT=$MysqlPort",
    "UTILISER_SQLITE=0",
    "DOSSIER_INTERFACE=$(Join-Path $Dossier 'app\interface')",
    "DOSSIER_SAUVEGARDES=$(Join-Path $Dossier 'sauvegardes')",
    "CHEMIN_MYSQL_BIN=$(if ($mysqlInclus) { Join-Path $Dossier 'mysql\bin' })",
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
    # Le mot de passe passe par une variable d'environnement de ce seul processus (jamais par la ligne de
    # commande, visible des autres programmes) ; la commande le vérifie (longueur, mots trop courants…).
    while ($true) {
        if ($NonInteractif) { $mdpAdmin = $env:RAQEEM_ADMIN_MDP }
        else {
            $mdpAdmin = Read-Secret "    Choisissez son mot de passe (8 caractères min., pas uniquement des chiffres)"
            $confirmation = Read-Secret "    Confirmez le mot de passe"
            if ($mdpAdmin -ne $confirmation) { Write-Host "    Les deux mots de passe sont différents." -ForegroundColor Yellow; continue }
        }
        if ([string]::IsNullOrEmpty($mdpAdmin)) {
            if ($NonInteractif) { Echec "Mot de passe du propriétaire absent (RAQEEM_ADMIN_MDP)." }
            Write-Host "    Le mot de passe ne peut pas être vide." -ForegroundColor Yellow; continue
        }
        $env:RAQEEM_ADMIN_MDP = $mdpAdmin
        Natif { & $py manage.py initialiser_donnees --identifiant admin }
        $codeAdmin = $LASTEXITCODE
        Remove-Item Env:RAQEEM_ADMIN_MDP -ErrorAction SilentlyContinue
        $mdpAdmin = $null; $confirmation = $null
        if ($codeAdmin -eq 0) { break }
        if ($codeAdmin -eq 3 -and -not $NonInteractif) { Write-Host "    Choisissez un autre mot de passe." -ForegroundColor Yellow; continue }
        Echec "Création du compte propriétaire impossible."
    }
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
    "REM python.exe -m waitress (et non waitress-serve.exe, non signé et bloqué par Smart App Control sur certains PC)",
    "`"$py`" -m waitress --host=$hote --port=$Port --threads=8 config.wsgi:application >> `"$(Join-Path $Dossier 'journaux\serveur.log')`" 2>&1"
) | Set-Content -Path $demarrer -Encoding ASCII
if ($SansTache) {
    Ok "Mode test : pas de tâche planifiée"
} else {
    Natif { schtasks /end /tn $NomTache 2>$null } | Out-Null
    try { Enregistrer-Tache $NomTache $demarrer } catch { Echec "Création de la tâche de démarrage impossible : $($_.Exception.Message)" }
    Start-ScheduledTask -TaskName $NomTache
    Ok "Le logiciel démarre automatiquement avec Windows (tâche « $NomTache »)"
    try { Activer-DemarrageMysql $MysqlPort } catch { Write-Host "    Attention : démarrage automatique de MySQL non réglé ($($_.Exception.Message))." -ForegroundColor Yellow }
    if ($Reseau) {
        netsh advfirewall firewall add rule name="RAQEEM PHARMA" dir=in action=allow protocol=TCP localport=$Port | Out-Null
        Ok "Pare-feu ouvert sur le port $Port pour les autres postes"
    }
    $raccourci = Join-Path ([Environment]::GetFolderPath("CommonDesktopDirectory")) "RAQEEM PHARMA.url"
    $icone = Join-Path $Dossier "raqeem.ico"
    Copy-Item (Join-Path $Paquet "raqeem.ico") $icone -Force -ErrorAction SilentlyContinue
    @("[InternetShortcut]", "URL=http://localhost:$Port/", "IconFile=$icone", "IconIndex=0") | Set-Content -Path $raccourci -Encoding ASCII
    Ok "Raccourci « RAQEEM PHARMA » sur le bureau"
}

# ---------------------------------------------------------------- 8. Vérification
Titre "8/8  Vérification"
@{ version = $version; dossier = $Dossier; port = $Port; reseau = [bool]$Reseau; base = $BdNom; installe_le = (Get-Date -Format "s") } |
    ConvertTo-Json | Set-Content -Path (Join-Path $Dossier "installation.json") -Encoding UTF8
if (-not $SansTache) {
    $repond = $false
    for ($i = 0; $i -lt 45 -and -not $repond; $i++) {
        Start-Sleep -Seconds 2
        try { $repond = (Invoke-WebRequest "http://127.0.0.1:$Port/api/licence/" -UseBasicParsing -TimeoutSec 3).StatusCode -eq 200 } catch { }
    }
    if (-not $repond) {
        $journal = Join-Path $Dossier "journaux\serveur.log"
        Write-Host ""
        Write-Host "    Dernières lignes de $journal :" -ForegroundColor Yellow
        if (Test-Path $journal) { Get-Content $journal -Tail 25 | ForEach-Object { Write-Host "      $_" } }
        else { Write-Host "      (journal absent : le serveur n'a pas été lancé par la tâche « $NomTache »)" }
        Afficher-EtatTache $NomTache
        Echec "Le logiciel ne répond pas. Envoyez une photo de ces lignes à Rawafid Digital Services."
    }
    Ok "Le logiciel répond sur http://localhost:$Port"
}
Push-Location (Join-Path $Dossier "app\backend")
$ligneCode = Natif { & $py manage.py licence 2>$null } | Select-String "Code du PC" | Select-Object -First 1
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
