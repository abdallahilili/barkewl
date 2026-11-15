"""
Sauvegarde et restauration de la base de données.

- MySQL : ``mysqldump`` (cohérent grâce à --single-transaction, sans bloquer les ventes), compressé en .sql.gz.
- SQLite : API de sauvegarde de sqlite3, compressée en .sqlite3.gz.

Chaque sauvegarde est d'abord écrite dans un fichier temporaire puis renommée : une coupure de courant
pendant l'écriture ne laisse jamais un fichier incomplet passer pour une sauvegarde valide.
Une copie peut être déposée dans un second dossier (clé USB, autre disque, dossier synchronisé en ligne).

Configuration (.env) :
  DOSSIER_SAUVEGARDES             dossier principal (défaut : backend/sauvegardes)
  DOSSIER_SAUVEGARDES_COPIE       second dossier facultatif (ex. E:\\RaqeemPharma ou un dossier OneDrive / Google Drive)
  SAUVEGARDES_JOURS_CONSERVATION  durée de conservation en jours (défaut : 30)
  SAUVEGARDE_INTERVALLE_HEURES    sauvegarde automatique si la dernière date de plus de N heures (défaut : 6, 0 = désactivée)
  CHEMIN_MYSQL_BIN                dossier contenant mysqldump.exe et mysql.exe (détecté automatiquement sinon)

Copie automatique sur clé USB / disque externe (sans .env : il suffit de « préparer » le disque depuis
Paramètres > Sauvegardes, ce qui crée le dossier RaqeemPharma_Sauvegardes\\ et son marqueur) :
  SAUVEGARDE_USB_INTERVALLE_HEURES  une copie si la plus récente de la clé date de plus de N heures (défaut : 24, 0 = désactivée)
  SAUVEGARDE_USB_NOMBRE             nombre de sauvegardes gardées sur chaque clé (défaut : 5, minimum 1)
  SAUVEGARDE_USB_RACINES            tests uniquement : chemins (séparés par os.pathsep) qui remplacent la détection des lecteurs
"""
import ctypes
import errno
import glob
import gzip
import json
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

journal = logging.getLogger("raqeem.sauvegarde")

PREFIXE = "raqeem_"
EXTENSIONS = (".sql.gz", ".sqlite3.gz")
# Les sauvegardes faites sous l'ancien nom (raqeem_…, barkewl_…) restent reconnues.
MOTIF_NOM = re.compile(r"^(raqeem|raqim|barkewl)_\d{8}_\d{6}(_[a-z]+)?\.(sql|sqlite3)\.gz$")
MINIMUM_CONSERVE = 7          # on garde toujours au moins les 7 dernières, même anciennes
FIN_DUMP_MYSQL = b"-- Dump completed"
_verrou = threading.Lock()

DOSSIER_USB = "RaqeemPharma_Sauvegardes"
MARQUEUR_USB = "RAQEEM_SAUVEGARDE.txt"
FICHIER_ETAT_USB = "etat_usb.json"      # ne correspond pas à MOTIF_NOM : jamais listé comme sauvegarde
REUTILISER_MINUTES = 60                 # une sauvegarde locale plus récente est copiée telle quelle
_verrou_usb = threading.Lock()          # une seule copie vers les clés à la fois
_verrou_etat_usb = threading.Lock()     # lecture-modification-écriture de etat_usb.json


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


def usb_intervalle_heures():
    try:
        return max(0.0, float(_env("SAUVEGARDE_USB_INTERVALLE_HEURES", "24")))
    except ValueError:
        return 24.0


def usb_nombre():
    try:
        return max(1, int(_env("SAUVEGARDE_USB_NOMBRE", "5")))
    except ValueError:
        return 5


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
    descripteur, chemin = tempfile.mkstemp(suffix=".cnf", prefix="raqeem_")
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
        "usb": etat_usb(),
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
    descripteur, temporaire = tempfile.mkstemp(suffix=".sqlite3", prefix="raqeem_")
    with os.fdopen(descripteur, "wb") as sortie, gzip.open(chemin, "rb") as entree:
        shutil.copyfileobj(entree, sortie)
    source = sqlite3.connect(temporaire)
    try:
        connection.ensure_connection()
        source.backup(connection.connection)
    finally:
        source.close()
        os.remove(temporaire)


# --------------------------------------------------------------------------- clé USB / disque externe
#
# Un lecteur n'est utilisé que s'il a été « préparé » (dossier RaqeemPharma_Sauvegardes\ + marqueur) :
# on n'écrit jamais sur la clé personnelle du pharmacien par surprise. La lettre (E:, F:…) n'a aucune
# importance. Sur la clé, seuls les fichiers qui correspondent à MOTIF_NOM sont supprimés par la rotation.

_DRIVE_REMOVABLE, _DRIVE_FIXED = 2, 3


def _meme_chemin(a, b):
    return os.path.normcase(os.path.normpath(str(a))) == os.path.normcase(os.path.normpath(str(b)))


def _decrire_lecteur(racine, nom_volume, type_lecteur, numero_serie=None):
    racine = str(racine)
    usage = shutil.disk_usage(racine)
    return {
        "racine": racine,
        "nom_volume": nom_volume,
        "numero_serie": numero_serie,
        "type": type_lecteur,
        "prepare": (Path(racine) / DOSSIER_USB / MARQUEUR_USB).is_file(),
        "espace_libre": usage.free,
    }


def _lecteurs_windows():
    kernel32 = ctypes.windll.kernel32
    if not getattr(_lecteurs_windows, "_mode_erreur", False):
        # Pas de fenêtre « Insérez un disque » pour un lecteur de carte vide (serveur sans écran).
        kernel32.SetErrorMode(0x8001)   # SEM_FAILCRITICALERRORS | SEM_NOOPENFILEERRORBOX
        _lecteurs_windows._mode_erreur = True
    exclus = {os.path.splitdrive(os.environ.get("SystemDrive", "C:"))[0].upper() or "C:",
              os.path.splitdrive(str(dossier_sauvegardes().resolve()))[0].upper()}
    lecteurs = []
    masque = kernel32.GetLogicalDrives()
    for i in range(2, 26):   # A: et B: ignorés
        if not masque & (1 << i):
            continue
        lettre = f"{chr(ord('A') + i)}:"
        if lettre in exclus:
            continue
        racine = lettre + "\\"
        try:
            type_lecteur = kernel32.GetDriveTypeW(racine)
            if type_lecteur not in (_DRIVE_REMOVABLE, _DRIVE_FIXED):
                continue
            nom = ctypes.create_unicode_buffer(261)
            serie = ctypes.c_uint32(0)
            if not kernel32.GetVolumeInformationW(racine, nom, 261, ctypes.byref(serie), None, None, None, 0):
                continue   # lecteur sans support (lecteur de carte vide) ou qui ne répond pas
            lecteurs.append(_decrire_lecteur(
                racine, nom.value, "amovible" if type_lecteur == _DRIVE_REMOVABLE else "disque",
                f"{serie.value:08X}" if serie.value else None,
            ))
        except OSError:
            continue
    return lecteurs


def lecteurs_externes():
    """Clés USB et disques externes branchés (hors disque système et disque des sauvegardes locales)."""
    racines = _env("SAUVEGARDE_USB_RACINES")
    if racines:
        lecteurs = []
        for racine in filter(None, (r.strip() for r in racines.split(os.pathsep))):
            try:
                if Path(racine).is_dir():
                    lecteurs.append(_decrire_lecteur(racine, Path(racine).name or racine, "amovible"))
            except OSError:
                continue
        return lecteurs
    if os.name != "nt":
        return []
    try:
        return _lecteurs_windows()
    except Exception:   # la détection ne doit jamais faire échouer la page ni le thread
        journal.exception("Détection des clés USB impossible")
        return []


def _identifiant(lecteur):
    """Clé dans etat_usb.json : nom du volume (+ numéro de série s'il est connu), sinon la racine."""
    nom = lecteur.get("nom_volume") or ""
    if lecteur.get("numero_serie"):   # stable même si la lettre change ou si la clé n'a pas de nom
        return f"{nom or 'Sans nom'} ({lecteur['numero_serie']})"
    return nom or lecteur["racine"]


def _maintenant():
    return datetime.now().astimezone()


# ---- état persistant (etat_usb.json)

def _chemin_etat_usb():
    return dossier_sauvegardes() / FICHIER_ETAT_USB


def _lire_etat_usb():
    etat = {}
    try:
        with open(_chemin_etat_usb(), encoding="utf-8") as f:
            etat = json.load(f)
    except (OSError, ValueError):
        pass   # absent ou illisible : traité comme vide
    if not isinstance(etat, dict):
        etat = {}
    if not isinstance(etat.get("lecteurs_connus"), dict):
        etat["lecteurs_connus"] = {}
    etat.setdefault("derniere_erreur", None)
    return etat


def _ecrire_etat_usb(etat):
    chemin = _chemin_etat_usb()
    temporaire = chemin.with_name(f".{chemin.name}.en-cours")
    with open(temporaire, "w", encoding="utf-8") as f:
        json.dump(etat, f, ensure_ascii=False, indent=2)
    os.replace(temporaire, chemin)


def _modifier_etat_usb(modification):
    with _verrou_etat_usb:
        etat = _lire_etat_usb()
        modification(etat)
        try:
            _ecrire_etat_usb(etat)
        except OSError:
            journal.exception("Écriture de %s impossible", FICHIER_ETAT_USB)


def _enregistrer_erreur_usb(message):
    journal.warning("Copie vers la clé USB : %s", message)
    _modifier_etat_usb(lambda etat: etat.update(derniere_erreur={"date": _maintenant().isoformat(), "message": message}))


def _enregistrer_lecteur(lecteur, **valeurs):
    def modification(etat):
        fiche = etat["lecteurs_connus"].setdefault(_identifiant(lecteur), {"derniere_copie": None})
        fiche["racine"] = lecteur["racine"]
        fiche["nom_volume"] = lecteur.get("nom_volume") or ""
        fiche.update(valeurs)
    _modifier_etat_usb(modification)


# ---- rotation, décision et copie

def _rotation_usb(dossier, nombre):
    """Garde les `nombre` sauvegardes les plus récentes du dossier ; ne touche à aucun autre fichier."""
    dossier = Path(dossier)
    for fichier in _fichiers(dossier)[max(0, nombre):]:
        fichier.unlink(missing_ok=True)
    if not dossier.is_dir():
        return
    for reste in dossier.glob(".*.en-cours"):   # copie interrompue (clé retirée pendant l'écriture)
        if MOTIF_NOM.match(reste.name[1:-len(".en-cours")]) and time.time() - reste.stat().st_mtime > 3600:
            reste.unlink(missing_ok=True)


def copie_usb_necessaire(lecteur):
    heures = usb_intervalle_heures()
    if heures <= 0:
        return False
    fichiers = _fichiers(Path(lecteur["racine"]) / DOSSIER_USB)
    if not fichiers:
        return True
    return time.time() - fichiers[0].stat().st_mtime >= heures * 3600


def _cle_pleine(erreur):
    return isinstance(erreur, OSError) and (erreur.errno == errno.ENOSPC or getattr(erreur, "winerror", None) == 112)


def _verifier_copie(source, copie):
    if copie.stat().st_size != source.stat().st_size:
        raise ErreurMetier("La copie sur la clé n'a pas la bonne taille.")
    try:
        with gzip.open(copie, "rb") as f:
            while f.read(1024 * 1024):
                pass
    except (OSError, EOFError) as erreur:
        raise ErreurMetier(f"La copie sur la clé est illisible : {erreur}") from erreur


def _copier_fichier(source, dossier):
    """Copie sûre : fichier temporaire, écriture forcée sur la clé, vérification, puis renommage."""
    temporaire = dossier / f".{source.name}.en-cours"
    final = dossier / source.name
    try:
        with open(source, "rb") as entree, open(temporaire, "wb") as sortie:
            shutil.copyfileobj(entree, sortie, 1024 * 1024)
            sortie.flush()
            os.fsync(sortie.fileno())
        shutil.copystat(source, temporaire)   # même date que la sauvegarde locale
        _verifier_copie(source, temporaire)
        os.replace(temporaire, final)
    except BaseException:
        try:
            temporaire.unlink(missing_ok=True)
        except OSError:
            pass
        raise
    return final


def _copier_vers_lecteur(source, lecteur):
    dossier = Path(lecteur["racine"]) / DOSSIER_USB
    nombre = usb_nombre()
    try:
        _copier_fichier(source, dossier)
    except OSError as erreur:
        if not _cle_pleine(erreur):
            raise
        journal.warning("Clé %s pleine : suppression des plus anciennes sauvegardes puis nouvel essai", lecteur["racine"])
        _rotation_usb(dossier, nombre - 1)
        try:
            _copier_fichier(source, dossier)
        except OSError as erreur_bis:
            if _cle_pleine(erreur_bis):
                raise ErreurMetier("Clé pleine : libérez de la place ou utilisez une clé plus grande.") from erreur_bis
            raise
    _rotation_usb(dossier, nombre)


def _message(erreur):
    return str(erreur.detail) if isinstance(erreur, ErreurMetier) else str(erreur) or erreur.__class__.__name__


def _source_pour_usb():
    """Sauvegarde locale à copier : la dernière si elle a moins d'une heure, sinon une nouvelle."""
    fichiers = _fichiers(dossier_sauvegardes())
    if fichiers and time.time() - fichiers[0].stat().st_mtime < REUTILISER_MINUTES * 60:
        return fichiers[0]
    return dossier_sauvegardes() / creer_sauvegarde(origine="auto")["nom"]


def copier_vers_usb(forcer=False):
    """
    Copie la sauvegarde la plus récente vers chaque lecteur préparé et branché.
    Sans `forcer`, seuls les lecteurs dont la dernière copie date de plus de SAUVEGARDE_USB_INTERVALLE_HEURES
    sont servis. Renvoie un résultat par lecteur ; les erreurs sont enregistrées, jamais propagées
    (sauf « copie déjà en cours »).
    """
    if not forcer and usb_intervalle_heures() <= 0:
        return []
    if not _verrou_usb.acquire(blocking=False):
        raise ErreurMetier("Une copie vers la clé USB est déjà en cours. Réessayez dans un instant.")
    try:
        lecteurs = []
        for lecteur in lecteurs_externes():
            try:
                if lecteur["prepare"] and (forcer or copie_usb_necessaire(lecteur)):
                    lecteurs.append(lecteur)
            except OSError as erreur:   # clé retirée pendant la lecture de son dossier
                _enregistrer_erreur_usb(f"{lecteur['racine']} : {_message(erreur)}")
        if not lecteurs:
            return []
        try:
            source = _source_pour_usb()
        except Exception as erreur:
            message = f"Sauvegarde à copier impossible : {_message(erreur)}"
            _enregistrer_erreur_usb(message)
            return [{"racine": l["racine"], "nom_volume": l["nom_volume"], "ok": False, "fichier": None, "erreur": message}
                    for l in lecteurs]

        resultats = []
        for lecteur in lecteurs:
            resultat = {"racine": lecteur["racine"], "nom_volume": lecteur["nom_volume"], "ok": False,
                        "fichier": source.name, "erreur": None}
            try:
                _copier_vers_lecteur(source, lecteur)
                resultat["ok"] = True
                _enregistrer_lecteur(lecteur, derniere_copie=_maintenant().isoformat())
                journal.info("Sauvegarde %s copiée sur %s", source.name, lecteur["racine"])
            except Exception as erreur:   # clé retirée, pleine, en lecture seule… : on réessaiera au tour suivant
                resultat["erreur"] = f"{lecteur['racine']} : {_message(erreur)}"
                _enregistrer_erreur_usb(resultat["erreur"])
            resultats.append(resultat)
        if all(r["ok"] for r in resultats):
            _modifier_etat_usb(lambda etat: etat.update(derniere_erreur=None))
        return resultats
    finally:
        _verrou_usb.release()


def preparer_lecteur(racine):
    """Crée le dossier et le marqueur sur un lecteur détecté, puis y copie aussitôt une sauvegarde."""
    lecteur = next((l for l in lecteurs_externes() if _meme_chemin(l["racine"], racine or "")), None)
    if not lecteur:
        raise ErreurMetier("Lecteur inconnu ou débranché.")
    try:
        from .parametres import obtenir_parametre
        nom_pharmacie = obtenir_parametre("nom_pharmacie")
    except Exception:
        nom_pharmacie = ""
    dossier = Path(lecteur["racine"]) / DOSSIER_USB
    try:
        dossier.mkdir(exist_ok=True)
        (dossier / MARQUEUR_USB).write_text(
            "RAQEEM PHARMA — disque de sauvegarde\r\n"
            f"Pharmacie : {nom_pharmacie or '-'}\r\n"
            f"Préparé le : {datetime.now().strftime('%d/%m/%Y %H:%M')}\r\n\r\n"
            "Ne pas supprimer : ce dossier reçoit les sauvegardes automatiques de RAQEEM PHARMA.\r\n",
            encoding="utf-8",
        )
    except OSError as erreur:
        raise ErreurMetier(f"Impossible de préparer {lecteur['racine']} : {erreur}") from erreur
    lecteur["prepare"] = True
    _enregistrer_lecteur(lecteur, date_preparation=_maintenant().isoformat())
    try:
        copies = copier_vers_usb(forcer=True)
    except ErreurMetier as erreur:   # une copie automatique tourne déjà : elle servira ce lecteur aussi
        copies = [{"racine": lecteur["racine"], "nom_volume": lecteur["nom_volume"], "ok": False,
                   "fichier": None, "erreur": _message(erreur)}]
    return {"lecteur": lecteur, "copies": copies}


def etat_usb():
    """État des clés pour Paramètres > Sauvegardes et l'alerte du tableau de bord."""
    heures = usb_intervalle_heures()
    etat = _lire_etat_usb()
    connus = etat["lecteurs_connus"]
    retard = timedelta(hours=heures + 2)

    def date(valeur):
        try:
            return datetime.fromisoformat(valeur) if valeur else None
        except (TypeError, ValueError):
            return None

    def en_retard(fiche):
        reference = date(fiche.get("derniere_copie")) or date(fiche.get("date_preparation"))
        return heures > 0 and (reference is None or _maintenant() - reference > retard)

    lecteurs, vus = [], set()
    for lecteur in lecteurs_externes():
        if not lecteur["prepare"]:
            continue
        identifiant = _identifiant(lecteur)
        vus.add(identifiant)
        fiche = connus.get(identifiant, {})
        try:
            fichiers = [_infos(f) for f in _fichiers(Path(lecteur["racine"]) / DOSSIER_USB)]
        except OSError:
            fichiers = []
        lecteurs.append({**lecteur, "identifiant": identifiant, "branche": True,
                         "derniere_copie": fiche.get("derniere_copie"), "fichiers": fichiers,
                         "en_retard": en_retard(fiche) if fiche else not fichiers})
    for identifiant, fiche in connus.items():
        if identifiant not in vus:
            lecteurs.append({"racine": fiche.get("racine", ""), "nom_volume": fiche.get("nom_volume", ""),
                             "identifiant": identifiant, "branche": False, "prepare": True, "type": None,
                             "espace_libre": None, "derniere_copie": fiche.get("derniere_copie"),
                             "fichiers": [], "en_retard": en_retard(fiche)})

    references = [date(f.get("derniere_copie")) or date(f.get("date_preparation")) for f in connus.values()]
    references = [r for r in references if r]
    copies = [c for c in (date(f.get("derniere_copie")) for f in connus.values()) if c]
    return {
        "actif": heures > 0,
        "intervalle_heures": heures,
        "nombre_conserve": usb_nombre(),
        "lecteurs": lecteurs,
        "lecteurs_connus": connus,
        "derniere_copie": max(copies).isoformat() if copies else None,
        "derniere_erreur": etat["derniere_erreur"],
        # Alerte seulement si une clé a déjà été préparée : une installation sans clé n'est jamais en rouge.
        "en_retard": bool(connus) and heures > 0 and (not references or _maintenant() - max(references) > retard),
    }


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
        try:   # copie vers la clé USB préparée (une fois par SAUVEGARDE_USB_INTERVALLE_HEURES)
            copier_vers_usb()
        except Exception:   # clé absente, retirée, pleine… : on réessaie dans 15 minutes
            journal.exception("Échec de la copie automatique vers la clé USB")
        finally:
            connection.close()
        time.sleep(15 * 60)


def demarrer_sauvegarde_automatique():
    """Lance la sauvegarde automatique en arrière-plan (une seule fois par processus serveur)."""
    if (intervalle_heures() <= 0 and usb_intervalle_heures() <= 0) or getattr(demarrer_sauvegarde_automatique, "_lance", False):
        return
    demarrer_sauvegarde_automatique._lance = True
    threading.Thread(target=_boucle_automatique, name="sauvegarde-auto", daemon=True).start()
