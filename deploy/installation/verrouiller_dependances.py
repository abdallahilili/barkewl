"""
Verrouille les paquets Python livrés au client : requirements-installation.in (plages) ->
requirements-installation.txt (versions exactes + empreintes SHA-256 de chaque fichier).

Le paquet d'installation est construit avec « pip download --require-hashes » : un fichier modifié
ou remplacé sur Internet est refusé, et deux constructions donnent exactement les mêmes composants.

    python verrouiller_dependances.py              (à relancer seulement pour changer de versions)
"""
import hashlib
import re
import subprocess
import sys
import tempfile
from pathlib import Path

ICI = Path(__file__).resolve().parent
VERSION_PYTHON = "3.12"   # même version que le Python embarqué (construire_paquet.ps1)


def main():
    with tempfile.TemporaryDirectory() as dossier:
        subprocess.run([
            sys.executable, "-m", "pip", "download", "--quiet", "--only-binary=:all:", "--platform", "win_amd64",
            "--python-version", VERSION_PYTHON, "--implementation", "cp",
            "--abi", "cp" + VERSION_PYTHON.replace(".", ""),
            "-r", str(ICI / "requirements-installation.in"), "-d", dossier,
        ], check=True)
        lignes = []
        for roue in sorted(Path(dossier).glob("*.whl"), key=lambda p: p.name.lower()):
            nom, version = roue.name.split("-")[:2]
            nom = re.sub(r"[-_.]+", "-", nom).lower()
            empreinte = hashlib.sha256(roue.read_bytes()).hexdigest()
            lignes.append(f"{nom}=={version} --hash=sha256:{empreinte}")
    entete = (
        "# FICHIER GÉNÉRÉ par verrouiller_dependances.py à partir de requirements-installation.in : ne pas modifier.\n"
        f"# Versions exactes et empreintes SHA-256 (Windows 64 bits, Python {VERSION_PYTHON}).\n"
    )
    (ICI / "requirements-installation.txt").write_text(entete + "\n".join(lignes) + "\n", encoding="utf-8")
    print(f"{len(lignes)} paquets verrouillés dans requirements-installation.txt")


if __name__ == "__main__":
    main()
