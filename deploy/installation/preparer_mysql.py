"""
Extrait de l'archive officielle MySQL (Windows, ZIP) uniquement ce qu'il faut au logiciel : le serveur
(mysqld), les outils mysql / mysqldump / mysqladmin, leurs DLL, les modules (plugins) et les messages (share).
Sont écartés : fichiers de débogage (.pdb, *-debug*), bibliothèques de développement (.lib, include),
documentation et analyseur de texte japonais (mecab). 1 Go -> environ 150 Mo.

    python preparer_mysql.py <archive mysql-…-winx64.zip> <dossier de destination>
"""
import re
import shutil
import sys
import zipfile
from pathlib import Path

OUTILS = {"mysqld.exe", "mysql.exe", "mysqldump.exe", "mysqladmin.exe"}


def garder(chemin):
    if not chemin or chemin.endswith("/"):
        return False
    if re.search(r"\.(pdb|lib|pl)$|-debug\.|/debug/", chemin, re.I):
        return False
    if chemin.startswith(("include/", "docs/", "man/", "lib/mecab")):
        return False
    if chemin.startswith("bin/") and chemin.lower().endswith(".exe") and chemin[4:].lower() not in OUTILS:
        return False
    return True


def main(archive, destination):
    destination = Path(destination)
    if destination.exists():
        shutil.rmtree(destination)
    total = 0
    with zipfile.ZipFile(archive) as z:
        for info in z.infolist():
            chemin = info.filename.split("/", 1)[1] if "/" in info.filename else ""
            if not garder(chemin):
                continue
            cible = destination / chemin
            cible.parent.mkdir(parents=True, exist_ok=True)
            with z.open(info) as source, open(cible, "wb") as sortie:
                shutil.copyfileobj(source, sortie)
            total += info.file_size
    if not (destination / "bin" / "mysqld.exe").exists():
        sys.exit("mysqld.exe absent de l'archive.")
    print(f"MySQL préparé : {total / 1e6:.0f} Mo")


if __name__ == "__main__":
    main(*sys.argv[1:3])
