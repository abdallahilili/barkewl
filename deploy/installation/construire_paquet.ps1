# RAQEEM PHARMA - construction du paquet d'installation (sur le PC de Rawafid Digital Services).
#
# Produit dist-installation\RaqeemPharma-<version>\ et le .zip correspondant : à copier sur clé USB.
# Le paquet contient tout ce qu'il faut chez le client, SANS Internet : le serveur, l'interface déjà
# construite (pas de Node.js chez le client), Python « embarqué » et les composants Python, prêts à copier.
#
#   powershell -ExecutionPolicy Bypass -File deploy\installation\construire_paquet.ps1
param(
    [string]$VersionPython = "3.12.10"
)
$ErrorActionPreference = "Stop"
$Ici = Split-Path -Parent $MyInvocation.MyCommand.Path
$Racine = Resolve-Path (Join-Path $Ici "..\..")
$PythonDev = Join-Path $Racine "backend\venv\Scripts\python.exe"

$version = ([regex]::Match((Get-Content (Join-Path $Racine "backend\config\version.py") -Raw), 'VERSION\s*=\s*"([^"]+)"')).Groups[1].Value
$nom = "RaqeemPharma-$version"
$sortie = Join-Path $Racine "dist-installation\$nom"
Write-Host "Construction de $nom" -ForegroundColor Cyan

if ((git -C $Racine status --porcelain backend) -ne $null) {
    Write-Host "Attention : des modifications du serveur ne sont pas enregistrées dans git ; le paquet utilise la dernière version enregistrée." -ForegroundColor Yellow
}
if (Test-Path $sortie) { Remove-Item -Recurse -Force $sortie }
New-Item -ItemType Directory -Force -Path (Join-Path $sortie "app") | Out-Null

# 1. Serveur : exactement la version enregistrée dans git (ni venv, ni .env, ni sauvegardes).
$archive = Join-Path $env:TEMP "raqeem-backend.zip"
git -C $Racine archive --format=zip -o $archive HEAD backend
Expand-Archive -Path $archive -DestinationPath (Join-Path $sortie "app") -Force
Remove-Item $archive
Write-Host "  OK serveur" -ForegroundColor Green

# 2. Interface construite, appelant le serveur à la même adresse (/api).
Push-Location (Join-Path $Racine "frontend")
try {
    $env:VITE_URL_API = "/api"
    npx tsc --noEmit
    if ($LASTEXITCODE -ne 0) { throw "Erreurs TypeScript : paquet non construit." }
    npx vite build --outDir (Join-Path $sortie "app\interface") --emptyOutDir --logLevel error
    if ($LASTEXITCODE -ne 0) { throw "Construction de l'interface impossible." }
} finally { Remove-Item Env:VITE_URL_API -ErrorAction SilentlyContinue; Pop-Location }
Write-Host "  OK interface" -ForegroundColor Green

# 3. Python « embarqué » officiel (python.org) : une simple archive à copier, sans installateur.
#    Gardé en cache ; la signature de python.exe (Python Software Foundation) est vérifiée.
$cache = Join-Path $Ici "cache"
New-Item -ItemType Directory -Force -Path $cache | Out-Null
$fichierPython = "python-$VersionPython-embed-amd64.zip"
if (-not (Test-Path (Join-Path $cache $fichierPython))) {
    Write-Host "  Téléchargement de $fichierPython depuis python.org..."
    Invoke-WebRequest "https://www.python.org/ftp/python/$VersionPython/$fichierPython" -OutFile (Join-Path $cache $fichierPython) -UseBasicParsing
}
Expand-Archive -Path (Join-Path $cache $fichierPython) -DestinationPath (Join-Path $sortie "python") -Force
$signature = Get-AuthenticodeSignature (Join-Path $sortie "python\python.exe")
if ($signature.Status -ne "Valid" -or $signature.SignerCertificate.Subject -notmatch "Python Software Foundation") {
    throw "Signature de python.exe invalide : paquet refusé."
}
Write-Host "  OK Python $VersionPython embarqué (signature vérifiée : Python Software Foundation)" -ForegroundColor Green

# 4. Composants Python (Django, PyMySQL, Waitress…) préparés ici, copiés tels quels chez le client.
$majeure = ($VersionPython.Split(".")[0..1] -join "")
$telechargement = Join-Path $env:TEMP "raqeem-paquets"
if (Test-Path $telechargement) { Remove-Item -Recurse -Force $telechargement }
& $PythonDev -m pip download --quiet --only-binary=:all: --platform win_amd64 --python-version ($VersionPython.Split(".")[0..1] -join ".") `
    --implementation cp --abi "cp$majeure" -r (Join-Path $Ici "requirements-installation.txt") -d $telechargement
if ($LASTEXITCODE -ne 0) { throw "Téléchargement des composants Python impossible." }
& $PythonDev -m pip install --quiet --no-index --no-deps --target (Join-Path $sortie "lib") (Get-ChildItem $telechargement -Filter *.whl).FullName
if ($LASTEXITCODE -ne 0) { throw "Préparation des composants Python impossible." }
# Pas de lanceurs .exe générés par pip (non signés : bloqués par Smart App Control) ; on passe toujours par python.exe -m.
Remove-Item -Recurse -Force (Join-Path $sortie "lib\bin") -ErrorAction SilentlyContinue
Get-ChildItem (Join-Path $sortie "lib") -Recurse -Directory -Filter "__pycache__" | Remove-Item -Recurse -Force
Remove-Item -Recurse -Force $telechargement
Write-Host "  OK composants Python ($((Get-ChildItem (Join-Path $sortie 'lib') -Directory -Filter '*.dist-info').Count) paquets)" -ForegroundColor Green

# 5. Scripts : en UTF-8 avec BOM pour que Windows PowerShell 5.1 lise correctement les accents.
$avecBom = New-Object Text.UTF8Encoding $true
foreach ($script in "installer.ps1", "mettre_a_jour.ps1") {
    [IO.File]::WriteAllText((Join-Path $sortie $script), [IO.File]::ReadAllText((Join-Path $Ici $script)), $avecBom)
}
foreach ($fichier in "Installer.bat", "Mettre_a_jour.bat") {
    $texte = [IO.File]::ReadAllText((Join-Path $Ici $fichier)) -replace "`r?`n", "`r`n"
    [IO.File]::WriteAllText((Join-Path $sortie $fichier), $texte, [Text.Encoding]::GetEncoding(1252))
}
Copy-Item (Join-Path $Ici "outils_installation.py"), (Join-Path $Ici "requirements-installation.txt"), (Join-Path $Ici "LISEZMOI.txt") $sortie
Set-Content -Path (Join-Path $sortie "VERSION.txt") -Value $version -Encoding ASCII

# 6. Archive à copier sur clé USB.
$zip = Join-Path $Racine "dist-installation\$nom.zip"
if (Test-Path $zip) { Remove-Item $zip }
Compress-Archive -Path $sortie -DestinationPath $zip
$taille = [math]::Round((Get-Item $zip).Length / 1MB, 1)
Write-Host ""
Write-Host "Paquet prêt : $zip ($taille Mo)" -ForegroundColor Green
