"""
Licence Barkewl (Rawafid Digital Services).

Une licence est une clé « BRKW1.<contenu>.<signature> » :
- le contenu (JSON) indique la pharmacie, le code du PC, l'abonnement et la date de fin ;
- la signature Ed25519 est faite par l'éditeur avec sa clé PRIVÉE (qui ne quitte jamais l'éditeur).
Le logiciel ne contient que la clé PUBLIQUE : il peut vérifier une licence, pas en fabriquer.
Tout fonctionne hors ligne.

À l'expiration (après 5 jours de grâce) : mode consultation. Les données restent visibles,
les ventes et modifications sont bloquées jusqu'au renouvellement. Rien n'est jamais supprimé.
"""
import base64
import hashlib
import json
import os
import platform
import threading
import time
import uuid
from datetime import date, timedelta

from django.db import transaction
from django.utils import timezone

from apps.commun.exceptions import ErreurMetier

from . import ed25519, editeur
from .models import EtatLicence

CLE_PUBLIQUE_HEX = "68e7777777eb5b42556168a7c5519b2f69317929f6da336763a5bbdabc3dc588"
PREFIXE = "BRKW1"
JOURS_GRACE = 5
JOURS_AVERTISSEMENT = 7
TOLERANCE_HORLOGE_JOURS = 2      # un PC peut avoir quelques heures d'avance un jour, puis être corrigé
DUREE_CACHE_SECONDES = 60

# Statuts. Les quatre derniers mettent le logiciel en consultation seule.
ACTIVE, EXPIRE_BIENTOT, GRACE = "ACTIVE", "EXPIRE_BIENTOT", "GRACE"
EXPIREE, NON_ACTIVEE, INVALIDE, HORLOGE = "EXPIREE", "NON_ACTIVEE", "INVALIDE", "HORLOGE"
STATUTS_BLOQUANTS = {EXPIREE, NON_ACTIVEE, INVALIDE, HORLOGE}

_cache = {"etat": None, "instant": 0.0}
_verrou = threading.Lock()


# --------------------------------------------------------------------------- empreinte du PC

def _identifiant_brut():
    if os.name == "nt":
        try:
            import winreg

            with winreg.OpenKey(winreg.HKEY_LOCAL_MACHINE, r"SOFTWARE\Microsoft\Cryptography", 0,
                                winreg.KEY_READ | winreg.KEY_WOW64_64KEY) as cle:
                return winreg.QueryValueEx(cle, "MachineGuid")[0]
        except OSError:
            pass
    for chemin in ("/etc/machine-id", "/var/lib/dbus/machine-id"):
        try:
            with open(chemin, encoding="ascii") as f:
                valeur = f.read().strip()
                if valeur:
                    return valeur
        except OSError:
            continue
    return f"{platform.node()}-{uuid.getnode()}"


def empreinte_machine():
    """Code du PC, ex. BRK-7F3A-91C2-04BD : identique à chaque démarrage, différent sur un autre PC."""
    empreinte = hashlib.sha256(f"barkewl:{_identifiant_brut()}".encode()).hexdigest()[:12].upper()
    return f"BRK-{empreinte[:4]}-{empreinte[4:8]}-{empreinte[8:]}"


# --------------------------------------------------------------------------- lecture d'une clé

def _b64(texte):
    return base64.urlsafe_b64decode(texte + "=" * (-len(texte) % 4))


def decoder_cle(cle):
    """Vérifie la signature et renvoie le contenu de la licence ; lève ErreurMetier si la clé est fausse."""
    cle = "".join((cle or "").split())   # tolère les retours à la ligne ajoutés par WhatsApp
    morceaux = cle.split(".")
    if len(morceaux) != 3 or morceaux[0] != PREFIXE:
        raise ErreurMetier("Clé de licence illisible : copiez-la en entier, elle commence par BRKW1.")
    try:
        charge, signature = _b64(morceaux[1]), _b64(morceaux[2])
    except (ValueError, TypeError):
        raise ErreurMetier("Clé de licence illisible.") from None
    if not ed25519.verifier(bytes.fromhex(CLE_PUBLIQUE_HEX), charge, signature):
        raise ErreurMetier("Clé de licence invalide (elle n'a pas été émise par Rawafid Digital Services).")
    try:
        contenu = json.loads(charge.decode("utf-8"))
        contenu["debut_date"] = date.fromisoformat(contenu["debut"])
        contenu["fin_date"] = date.fromisoformat(contenu["fin"])
    except (ValueError, KeyError, UnicodeDecodeError):
        raise ErreurMetier("Clé de licence invalide.") from None
    return contenu


# --------------------------------------------------------------------------- état

def _etat_ligne():
    etat = EtatLicence.objects.first()
    return etat or EtatLicence.objects.create()


def _calculer():
    aujourdhui = timezone.localdate()
    empreinte = empreinte_machine()
    resultat = {
        "statut": NON_ACTIVEE, "lecture_seule": True, "message": "", "empreinte": empreinte,
        "client": None, "plan": None, "debut": None, "fin": None, "jours_restants": None,
        "editeur": editeur.coordonnees(),
    }
    with transaction.atomic():
        etat = EtatLicence.objects.select_for_update().filter(pk=_etat_ligne().pk).first()
        derniere = etat.derniere_date_vue
        if derniere and aujourdhui < derniere - timedelta(days=TOLERANCE_HORLOGE_JOURS):
            resultat.update(statut=HORLOGE, message=(
                f"La date de l'ordinateur ({aujourdhui:%d/%m/%Y}) est antérieure à une date déjà utilisée "
                f"({derniere:%d/%m/%Y}). Corrigez la date et l'heure de Windows."))
            return resultat
        if derniere is None or aujourdhui > derniere:
            etat.derniere_date_vue = aujourdhui
            etat.save(update_fields=["derniere_date_vue"])
        cle = etat.cle

    if not cle:
        resultat["message"] = "Logiciel non activé : envoyez le code de ce PC à Rawafid Digital Services pour recevoir votre licence."
        return resultat
    try:
        contenu = decoder_cle(cle)
    except ErreurMetier as erreur:
        resultat.update(statut=INVALIDE, message=str(erreur.detail))
        return resultat
    resultat.update(client=contenu.get("client"), plan=contenu.get("plan"),
                    debut=contenu["debut_date"], fin=contenu["fin_date"])
    if contenu.get("machine") != empreinte:
        resultat.update(statut=INVALIDE, message=(
            "Cette licence a été émise pour un autre ordinateur. Envoyez le code de ce PC à Rawafid Digital Services."))
        return resultat

    restants = (contenu["fin_date"] - aujourdhui).days
    resultat["jours_restants"] = restants
    if restants < -JOURS_GRACE:
        resultat.update(statut=EXPIREE, message=(
            f"Licence expirée le {contenu['fin_date']:%d/%m/%Y} : le logiciel est en consultation seule "
            "(aucune vente possible). Vos données sont intactes. Renouvelez votre abonnement auprès de Rawafid Digital Services."))
    elif restants < 0:
        resultat.update(statut=GRACE, lecture_seule=False, message=(
            f"Licence expirée le {contenu['fin_date']:%d/%m/%Y}. Les ventes seront bloquées dans "
            f"{JOURS_GRACE + restants} jour(s) : renouvelez votre abonnement."))
    elif restants <= JOURS_AVERTISSEMENT:
        resultat.update(statut=EXPIRE_BIENTOT, lecture_seule=False,
                        message=f"Votre licence expire dans {restants} jour(s), le {contenu['fin_date']:%d/%m/%Y}.")
    else:
        resultat.update(statut=ACTIVE, lecture_seule=False, message="")
    return resultat


def etat_licence(forcer=False):
    """État de la licence, recalculé au plus une fois par minute (vérification de signature incluse)."""
    with _verrou:
        if forcer or _cache["etat"] is None or time.monotonic() - _cache["instant"] > DUREE_CACHE_SECONDES:
            _cache["etat"] = _calculer()
            _cache["instant"] = time.monotonic()
        return _cache["etat"]


def vider_cache():
    with _verrou:
        _cache["etat"] = None


@transaction.atomic
def activer_licence(cle, utilisateur):
    from apps.commun.audit import enregistrer_audit

    contenu = decoder_cle(cle)
    empreinte = empreinte_machine()
    if contenu.get("machine") != empreinte:
        raise ErreurMetier(f"Cette clé a été émise pour un autre ordinateur ({contenu.get('machine')}) ; ce PC est {empreinte}.")
    if contenu["fin_date"] < timezone.localdate() - timedelta(days=JOURS_GRACE):
        raise ErreurMetier(f"Cette clé a expiré le {contenu['fin_date']:%d/%m/%Y}.")
    etat = EtatLicence.objects.select_for_update().filter(pk=_etat_ligne().pk).first()
    etat.cle = "".join(cle.split())
    etat.date_activation = timezone.now()
    etat.save(update_fields=["cle", "date_activation"])
    enregistrer_audit(utilisateur, "ACTIVATION", "Licence", etat.pk, reference=contenu.get("id", ""),
                      nouvelle={"client": contenu.get("client"), "plan": contenu.get("plan"), "fin": contenu["fin"]},
                      description=f"Licence {contenu.get('plan')} jusqu'au {contenu['fin_date']:%d/%m/%Y}")
    vider_cache()
    return etat_licence(forcer=True)
