"""
Sauvegarde et restauration de la base de données.

- MySQL : ``mysqldump`` (cohérent grâce à --single-transaction, sans bloquer les ventes), compressé en .sql.gz.
- SQLite : API de sauvegarde de sqlite3, compressée en .sqlite3.gz.

Chaque sauvegarde est d'abord écrite dans un fichier temporaire puis renommée : une coupure de courant
pendant l'écriture ne laisse jamais un fichier incomplet passer pour une sauvegarde valide.
Une copie peut être déposée dans un second dossier (clé USB, autre disque, dossier synchronisé en ligne).

Configuration (.env) :
  DOSSIER_SAUVEGARDES             dossier principal (défaut : backend/sauvegardes)
  DOSSIER_SAUVEGARDES_COPIE       second dossier facultatif (ex. E:\\Barkewl ou un dossier OneDrive / Google Drive)
  SAUVEGARDES_JOURS_CONSERVATION  durée de conservation en jours (défaut : 30)
  SAUVEGARDE_INTERVALLE_HEURES    sauvegarde automatique si la dernière date de plus de N heures (défaut : 6, 0 = désactivée)
  CHEMIN_MYSQL_BIN                dossier contenant mysqldump.exe et mysql.exe (détecté automatiquement sinon)
"""
import glob
import gzip
import logging
import os
import re
import shutil
import sqlite3
import subprocess
import tempfile
import threading
import time
from datetime import datetime, timedelta
from pathlib import Path

from django.conf import settings
from django.db import connection

from .exceptions import ErreurMetier

journal = logging.getLogger("barkewl.sauvegarde")

PREFIXE = "barkewl_"
EXTENSIONS = (".sql.gz", ".sqlite3.gz")
MOTIF_NOM = re.compile(r"^barkewl_\d{8}_\d{6}(_[a-z]+)?\.(sql|sqlite3)\.gz$")
MINIMUM_CONSERVE = 7          # on garde toujours au moins les 7 dernières, même anciennes
FIN_DUMP_MYSQL = b"-- Dump completed"
_verrou = threading.Lock()


# --------------------------------------------------------------------------- configuration

def _env(cle, defaut=""):
    return os.environ.get(cle, defaut).strip()


def dossier_sauvegardes():
    dossier = Path(_env("DOSSIER_SAUVEGARDES") or settings.BASE_DIR / "sauvegardes")
    dossier.mkdir(parents=True, exist_ok=True)
    return dossier


def dossier_copie():
    valeur = _env("DOSSIER_SAUVEGARDES_COPIE")
    return Path(valeur) if valeur else None


def jours_conservation():
    try:
        return max(1, int(_env("SAUVEGARDES_JOURS_CONSERVATION", "30")))
    except ValueError:
        return 30


def intervalle_heures():
    try:
        return max(0.0, float(_env("SAUVEGARDE_INTERVALLE_HEURES", "6")))
    except ValueError:
        return 6.0


def _est_mysql():
    return connection.vendor == "mysql"


def trouver_outil_mysql(nom):
    """Chemin de mysqldump / mysql : CHEMIN_MYSQL_BIN, PATH, puis WampServer, XAMPP, MySQL, MariaDB."""
    exe = f"{nom}.exe" if os.name == "nt" else nom
    dossier = _env("CHEMIN_MYSQL_BIN")
    if dossier and (Path(dossier) / exe).is_file():
        return str(Path(dossier) / exe)
    dans_path = shutil.which(nom)
    if dans_path:
        return dans_path
    motifs = [
        r"C:\wamp64\bin\mysql\*\bin", r"C:\wamp\bin\mysql\*\bin", r"C:\wamp64\bin\mariadb\*\bin",
        r"C:\xampp\mysql\bin", r"C:\Program Files\MySQL\*\bin", r"C:\Program Files\MariaDB*\bin",
    ]
    candidats = [Path(d) / exe for motif in motifs for d in glob.glob(motif) if (Path(d) / exe).is_file()]
    if not candidats:
        return None
    # WampServer installe MySQL ET MariaDB : l'outil doit correspondre au serveur réellement utilisé
    # (un mysqldump MariaDB ne sait pas se connecter à MySQL 8, et inversement).
    try:
        version_serveur = connection.mysql_version
        serveur_mariadb = connection.mysql_is_mariadb
    except Exception:
        version_serveur, serveur_mariadb = (), False

    def score(chemin):
        dossier = str(chemin.parent.parent.name).lower()
        version = tuple(int(n) for n in re.findall(r"\d+", dossier))
        return (("mariadb" in str(chemin).lower()) == serveur_mariadb, version[:3] == tuple(version_serveur)[:3], version)

    return str(max(candidats, key=score))


def _fichier_identifiants(db):
    """Fichier d'options temporaire : le mot de passe n'apparaît jamais sur la ligne de commande."""
    descripteur, chemin = tempfile.mkstemp(suffix=".cnf", prefix="barkewl_")
    mot_de_passe = (db["PASSWORD"] or "").replace("\\", "\\\\").replace('"', '\\"')
    with os.fdopen(descripteur, "w", encoding="utf-8") as f:
        f.write("[client]\n")
        f.write(f"user={db['USER']}\n")
        f.write(f"password=\"{mot_de_passe}\"\n")
        f.write(f"host={db['HOST'] or '127.0.0.1'}\n")
        f.write(f"port={db['PORT'] or 3306}\n")
        f.write("default-character-set=utf8mb4\n")
    return chemin


def _sans_fenetre():
    # Évite l'ouverture d'une fenêtre de console sous Windows quand le serveur tourne en arrière-plan.
    return {"creationflags": subprocess.CREATE_NO_WINDOW} if os.name == "nt" else {}


# --------------------------------------------------------------------------- sauvegarde

def _sauvegarder_mysql(temporaire):
    mysqldump = trouver_outil_mysql("mysqldump")
    if not mysqldump:
        raise ErreurMetier(
            "mysqldump introuvable. Indiquez le dossier de MySQL dans CHEMIN_MYSQL_BIN (fichier .env), "
            r"par exemple C:\wamp64\bin\mysql\mysql8.4.7\bin."
        )
    db = connection.settings_dict
    identifiants = _fichier_identifiants(db)
    try:
        commande = [
            mysqldump, f"--defaults-extra-file={identifiants}", "--single-transaction", "--quick",
            "--routines", "--triggers", "--no-tablespaces", "--hex-blob", "--add-drop-table", db["NAME"],
        ]
        with gzip.open(temporaire, "wb", compresslevel=6) as sortie:
            processus = subprocess.Popen(commande, stdout=subprocess.PIPE, stderr=subprocess.PIPE, **_sans_fenetre())
            fin = b""
            for bloc in iter(lambda: processus.stdout.read(1024 * 256), b""):
                sortie.write(bloc)
                fin = (fin + bloc)[-512:]
            erreurs = processus.stderr.read().decode("utf-8", "replace").strip()
            code = processus.wait()
        if code != 0:
            raise ErreurMetier(f"La sauvegarde MySQL a échoué : {erreurs or f'code {code}'}")
        if FIN_DUMP_MYSQL not in fin:
            raise ErreurMetier("La sauvegarde MySQL est incomplète (fin du fichier absente).")
    finally:
        os.remove(identifiants)


def _sauvegarder_sqlite(temporaire):
    connection.ensure_connection()
    copie_brute = temporaire.with_suffix(".brut")
    destination = sqlite3.connect(str(copie_brute))
    try:
        connection.connection.backup(destination)
    finally:
        destination.close()
    with open(copie_brute, "rb") as entree, gzip.open(temporaire, "wb", compresslevel=6) as sortie:
        shutil.copyfileobj(entree, sortie)
    copie_brute.unlink()


def creer_sauvegarde(origine="manuelle"):
    """
    Crée une sauvegarde complète et renvoie ses informations.
    origine : « manuelle », « auto » ou « restauration » (sauvegarde de sécurité avant une restauration).
    """
    if not _verrou.acquire(blocking=False):
        raise ErreurMetier("Une sauvegarde est déjà en cours. Réessayez dans un instant.")
    try:
        dossier = dossier_sauvegardes()
        horodatage = datetime.now().strftime("%Y%m%d_%H%M%S")
        suffixe = "" if origine == "manuelle" else f"_{origine}"
        extension = ".sql.gz" if _est_mysql() else ".sqlite3.gz"
        final = dossier / f"{PREFIXE}{horodatage}{suffixe}{extension}"
        temporaire = dossier / f".{final.name}.en-cours"
        debut = time.monotonic()
        try:
            (_sauvegarder_mysql if _est_mysql() else _sauvegarder_sqlite)(temporaire)
            os.replace(temporaire, final)
        except Exception:
            temporaire.unlink(missing_ok=True)
            raise

        copie_erreur = None
        copie = dossier_copie()
        if copie:
            try:
                copie.mkdir(parents=True, exist_ok=True)
                shutil.copy2(final, copie / final.name)
                _purger(copie)
            except OSError as erreur:
                copie_erreur = f"Copie vers {copie} impossible : {erreur}"
                journal.warning(copie_erreur)
        _purger(dossier)
        infos = _infos(final)
        infos["duree_secondes"] = round(time.monotonic() - debut, 1)
        infos["copie_erreur"] = copie_erreur
        journal.info("Sauvegarde créée : %s (%s octets)", final.name, infos["taille"])
        return infos
    finally:
        _verrou.release()


def _purger(dossier):
    """Supprime les sauvegardes plus anciennes que la durée de conservation (en gardant les plus récentes)."""
    fichiers = _fichiers(dossier)
    limite = datetime.now() - timedelta(days=jours_conservation())
    for fichier in fichiers[MINIMUM_CONSERVE:]:
        if datetime.fromtimestamp(fichier.stat().st_mtime) < limite:
            fichier.unlink(missing_ok=True)
    for reste in dossier.glob(f".{PREFIXE}*.en-cours"):   # restes d'une sauvegarde interrompue
        if time.time() - reste.stat().st_mtime > 3600:
            reste.unlink(missing_ok=True)


# --------------------------------------------------------------------------- consultation

def _fichiers(dossier):
    if not dossier.is_dir():
        return []
    fichiers = [f for f in dossier.iterdir() if f.is_file() and MOTIF_NOM.match(f.name)]
    return sorted(fichiers, key=lambda f: f.stat().st_mtime, reverse=True)


def _infos(fichier):
    stat = fichier.stat()
    return {
        "nom": fichier.name,
        "taille": stat.st_size,
        "date": datetime.fromtimestamp(stat.st_mtime).astimezone().isoformat(),
        "origine": "auto" if "_auto." in fichier.name else ("restauration" if "_restauration." in fichier.name else "manuelle"),
    }


def lister_sauvegardes():
    return [_infos(f) for f in _fichiers(dossier_sauvegardes())]


def derniere_sauvegarde():
    fichiers = _fichiers(dossier_sauvegardes())
    return _infos(fichiers[0]) if fichiers else None


def etat_sauvegardes():
    """Résumé pour l'interface : dernière sauvegarde et alerte si elle est trop ancienne."""
    derniere = derniere_sauvegarde()
    en_retard = True
    if derniere:
        age = datetime.now().astimezone() - datetime.fromisoformat(derniere["date"])
        en_retard = age > timedelta(hours=max(intervalle_heures(), 6) + 20)
    copie = dossier_copie()
    return {
        "derniere": derniere,
        "en_retard": en_retard,
        "dossier": str(dossier_sauvegardes()),
        "dossier_copie": str(copie) if copie else None,
        "dossier_copie_accessible": bool(copie and copie.is_dir()),
        "jours_conservation": jours_conservation(),
        "intervalle_heures": intervalle_heures(),
    }


def chemin_sauvegarde(nom):
    """Chemin d'une sauvegarde à partir de son nom (refuse tout chemin hors du dossier)."""
    if not MOTIF_NOM.match(nom or ""):
        raise ErreurMetier("Nom de sauvegarde invalide.")
    chemin = dossier_sauvegardes() / nom
    if not chemin.is_file():
        raise ErreurMetier("Sauvegarde introuvable.")
    return chemin


# --------------------------------------------------------------------------- restauration

def restaurer_sauvegarde(chemin):
    """
    Remplace TOUTE la base par le contenu de la sauvegarde.
    Une sauvegarde de sécurité de l'état actuel est faite juste avant.
    """
    chemin = Path(chemin)
    if not chemin.is_file():
        raise ErreurMetier(f"Fichier introuvable : {chemin}")
    if _est_mysql() and not chemin.name.endswith(".sql.gz"):
        raise ErreurMetier("Avec MySQL, seule une sauvegarde .sql.gz peut être restaurée.")
    if not _est_mysql() and not chemin.name.endswith(".sqlite3.gz"):
        raise ErreurMetier("Avec SQLite, seule une sauvegarde .sqlite3.gz peut être restaurée.")

    securite = creer_sauvegarde(origine="restauration")
    if _est_mysql():
        connection.close()
        _restaurer_mysql(chemin)
    else:
        _restaurer_sqlite(chemin)
    return securite


def _restaurer_mysql(chemin):
    client = trouver_outil_mysql("mysql")
    if not client:
        raise ErreurMetier("Client mysql introuvable. Indiquez le dossier de MySQL dans CHEMIN_MYSQL_BIN (fichier .env).")
    db = connection.settings_dict
    identifiants = _fichier_identifiants(db)
    try:
        processus = subprocess.Popen(
            [client, f"--defaults-extra-file={identifiants}", db["NAME"]],
            stdin=subprocess.PIPE, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE, **_sans_fenetre(),
        )
        with gzip.open(chemin, "rb") as entree:
            shutil.copyfileobj(entree, processus.stdin, 1024 * 256)
        processus.stdin.close()
        erreurs = processus.stderr.read().decode("utf-8", "replace").strip()
        if processus.wait() != 0:
            raise ErreurMetier(f"La restauration a échoué : {erreurs}")
    finally:
        os.remove(identifiants)


def _restaurer_sqlite(chemin):
    descripteur, temporaire = tempfile.mkstemp(suffix=".sqlite3", prefix="barkewl_")
    with os.fdopen(descripteur, "wb") as sortie, gzip.open(chemin, "rb") as entree:
        shutil.copyfileobj(entree, sortie)
    source = sqlite3.connect(temporaire)
    try:
        connection.ensure_connection()
        source.backup(connection.connection)
    finally:
        source.close()
        os.remove(temporaire)


# --------------------------------------------------------------------------- automatique

def sauvegarde_necessaire():
    heures = intervalle_heures()
    if heures <= 0:
        return False
    derniere = derniere_sauvegarde()
    if not derniere:
        return True
    return datetime.now().astimezone() - datetime.fromisoformat(derniere["date"]) >= timedelta(hours=heures)


def _boucle_automatique():
    time.sleep(120)   # laisse le temps à MySQL de démarrer avec Windows
    while True:
        try:
            if sauvegarde_necessaire():
                creer_sauvegarde(origine="auto")
        except Exception:   # ne jamais arrêter le serveur ; l'erreur est journalisée et on réessaie plus tard
            journal.exception("Échec de la sauvegarde automatique")
        finally:
            connection.close()
        time.sleep(15 * 60)


def demarrer_sauvegarde_automatique():
    """Lance la sauvegarde automatique en arrière-plan (une seule fois par processus serveur)."""
    if intervalle_heures() <= 0 or getattr(demarrer_sauvegarde_automatique, "_lance", False):
        return
    demarrer_sauvegarde_automatique._lance = True
    threading.Thread(target=_boucle_automatique, name="sauvegarde-auto", daemon=True).start()
