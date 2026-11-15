# RAQEEM PHARMA - fonctions communes à l'installation (installer.ps1) et à la mise à jour (mettre_a_jour.ps1).
# Chargé au début de chaque script par : . (Join-Path $PSScriptRoot "commun.ps1")
# Une correction faite ici vaut pour les deux scripts : ne pas recopier ces fonctions ailleurs.
# Compatible Windows PowerShell 5.1 (enregistré en UTF-8 avec BOM dans le paquet).

$NomTache = "RaqeemPharma"           # tâche Windows qui lance le serveur au démarrage
$NomServiceMysql = "RaqeemMySQL"     # service Windows du MySQL inclus dans le paquet complet

# ------------------------------------------------------------------------------------------- Affichage
function Titre($texte) { Write-Host ""; Write-Host "==> $texte" -ForegroundColor Cyan }
function Ok($texte) { Write-Host "    OK  $texte" -ForegroundColor Green }
function Attention($texte) { Write-Host "    Attention : $texte" -ForegroundColor Yellow }

# ------------------------------------------------------------------------------------------- Programmes externes
# Programmes externes (python, robocopy…) : seul leur code de sortie compte. Sous PowerShell 5.1, avec
# « Stop », un simple message d'information écrit sur la sortie d'erreur interromprait le script.
function Natif([scriptblock]$bloc) { $ErrorActionPreference = "Continue"; & $bloc }

# Copie miroir d'un dossier (robocopy : code >= 8 = échec).
function Copier($source, $cible, [string[]]$exclusions = @()) {
    $arguments = @($source, $cible, "/MIR", "/NFL", "/NDL", "/NJH", "/NJS", "/NP", "/XD", "__pycache__") + $exclusions
    robocopy @arguments | Out-Null
    if ($LASTEXITCODE -ge 8) { throw "Copie impossible : $source -> $cible" }
}

# Vrai si ce PC laisse le logiciel ouvrir ce port :
#   1) aucun programme n'écoute déjà sur ce port, quelle que soit l'adresse (IPv4, IPv6 « :: », 0.0.0.0).
#      Windows accepte d'ouvrir 127.0.0.1:3306 alors qu'un MySQL écoute déjà sur « :: » port 3306 : les deux
#      serveurs coexisteraient et le logiciel parlerait au mauvais (vu sur le PC de développement) ;
#   2) l'ouverture réelle réussit (un port peut être libre mais interdit par Windows : Hyper-V / WSL / Docker,
#      erreur 10013).
function Test-PortLibre($python, [string]$adresse, [int]$numero) {
    if (Get-NetTCPConnection -LocalPort $numero -State Listen -ErrorAction SilentlyContinue) { return $false }
    Natif { & $python -c "import socket; s = socket.socket(); s.bind(('$adresse', $numero)); s.close()" 2>$null } | Out-Null
    return ($LASTEXITCODE -eq 0)
}

function Attendre-Port([int]$numero, [int]$secondes) {
    for ($i = 0; $i -lt $secondes; $i++) {
        if (Get-NetTCPConnection -LocalPort $numero -State Listen -ErrorAction SilentlyContinue) { return $true }
        Start-Sleep -Seconds 1
    }
    return $false
}

# ------------------------------------------------------------------------------------------- Python embarqué
# Ses chemins de recherche sont fixés par le fichier python3XX._pth (variables d'environnement ignorées).
# On y ajoute les composants (lib) et le serveur (app\backend).
function Write-CheminsPython($dossierInstallation) {
    $pth = Get-ChildItem (Join-Path $dossierInstallation "python") -Filter "python3*._pth" | Select-Object -First 1
    if (-not $pth) { throw "Fichier ._pth du Python embarqué introuvable." }
    $zip = (Get-ChildItem (Join-Path $dossierInstallation "python") -Filter "python3*.zip" | Select-Object -First 1).Name
    $lignes = @($zip, ".", (Join-Path $dossierInstallation "lib"), (Join-Path $dossierInstallation "app\backend"))
    [IO.File]::WriteAllLines($pth.FullName, $lignes, (New-Object Text.UTF8Encoding $false))
}

# ------------------------------------------------------------------------------------------- Tâche de démarrage
# Pas « schtasks /create » : ses réglages par défaut empêchent le démarrage d'un PC portable sur batterie
# et arrêtent le serveur au bout de 72 heures.
function Enregistrer-Tache($nom, $bat) {
    $action = New-ScheduledTaskAction -Execute "cmd.exe" -Argument "/c `"$bat`""
    $declencheur = New-ScheduledTaskTrigger -AtStartup
    $principal = New-ScheduledTaskPrincipal -UserId "SYSTEM" -LogonType ServiceAccount -RunLevel Highest
    $reglages = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable `
        -ExecutionTimeLimit ([TimeSpan]::Zero) -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) -MultipleInstances IgnoreNew
    Register-ScheduledTask -TaskName $nom -Action $action -Trigger $declencheur -Principal $principal -Settings $reglages -Force | Out-Null
}

# Diagnostic affiché quand le serveur ne répond pas.
function Afficher-EtatTache($nom) {
    $info = Get-ScheduledTaskInfo -TaskName $nom -ErrorAction SilentlyContinue
    $tache = Get-ScheduledTask -TaskName $nom -ErrorAction SilentlyContinue
    if ($tache) { Write-Host "      Tâche : état $($tache.State), dernier lancement $($info.LastRunTime), résultat 0x$('{0:X}' -f $info.LastTaskResult)" }
    else { Write-Host "      Tâche « $nom » introuvable." }
    $batterie = Get-CimInstance Win32_Battery -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($batterie) { Write-Host "      Batterie : $($batterie.EstimatedChargeRemaining) % (statut $($batterie.BatteryStatus) ; 2 = sur secteur)" }
}

# ------------------------------------------------------------------------------------------- Service MySQL
# Retrouve le service Windows du MySQL (ou MariaDB) qui sert la base sur ce port :
#   1) le service dont le processus écoute sur le port (MySQL démarré) ;
#   2) sinon, le service dont le my.ini (dossier de sa version, comme dans WampServer) indique ce port
#      (MySQL arrêté, par exemple WampServer fermé).
function Trouver-ServiceMysql([int]$portBase) {
    $services = @(Get-CimInstance Win32_Service -ErrorAction SilentlyContinue | Where-Object { $_.PathName -match "mysqld|mariadbd" })
    $pids = @(Get-NetTCPConnection -LocalPort $portBase -State Listen -ErrorAction SilentlyContinue | ForEach-Object { $_.OwningProcess })
    $service = $services | Where-Object { $pids -contains $_.ProcessId } | Select-Object -First 1
    if (-not $service) {
        $service = $services | Where-Object {
            $exe = ($_.PathName -replace '^"([^"]+)".*$', '$1') -replace '^(\S+\.exe).*$', '$1'
            $ini = Join-Path (Split-Path (Split-Path $exe)) "my.ini"
            (Test-Path $ini) -and (Select-String -Path $ini -Pattern "^\s*port\s*=\s*$portBase\s*$" -Quiet)
        } | Select-Object -First 1
    }
    return $service
}

# WampServer installe MySQL comme service en démarrage « manuel » : sans ouvrir WampServer, le logiciel
# n'aurait pas de base. On passe le service en démarrage automatique.
function Activer-DemarrageMysql([int]$portBase) {
    $service = Trouver-ServiceMysql $portBase
    if (-not $service) {
        Attention "service MySQL non trouvé. Lancez WampServer au démarrage de Windows."
        return
    }
    if ($service.StartMode -ne "Auto") { Set-Service -Name $service.Name -StartupType Automatic -ErrorAction Stop }
    Ok "MySQL démarre automatiquement avec Windows (service « $($service.Name) »)"
}
