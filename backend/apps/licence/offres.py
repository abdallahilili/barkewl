"""
Offres commerciales RAQEEM PHARMA : ce que débloque la licence selon la taille de la pharmacie.

    Essentiel      petite pharmacie : 3 comptes, Propriétaire + Vendeur
    Professionnel  pharmacie moyenne ou grande : 10 comptes, 4 rôles, transferts, facturation, approbation par PIN
    Réseau         chaîne de pharmacies : comptes illimités, tout

L'offre est écrite dans la clé de licence signée par Rawafid Digital Services : elle ne peut pas être modifiée
par le client. Une licence sans offre (émise avant les offres) vaut Professionnel.
"""
from django.conf import settings
from rest_framework.exceptions import APIException

from apps.commun.constantes import ADMIN, CAISSIER, MAGASINIER, PHARMACIEN

ESSENTIEL, PRO, RESEAU = "ESSENTIEL", "PRO", "RESEAU"

OFFRES = {
    ESSENTIEL: {
        "nom": "Essentiel", "max_utilisateurs": 3, "roles": (ADMIN, CAISSIER),
        "fonctions": set(),
    },
    PRO: {
        "nom": "Professionnel", "max_utilisateurs": 10, "roles": (ADMIN, PHARMACIEN, CAISSIER, MAGASINIER),
        "fonctions": {"transferts", "facturation", "approbation"},
    },
    RESEAU: {
        "nom": "Réseau", "max_utilisateurs": None, "roles": (ADMIN, PHARMACIEN, CAISSIER, MAGASINIER),
        "fonctions": {"transferts", "facturation", "approbation", "reseau"},
    },
}

# Modules de l'interface liés à une fonction d'offre (absents du menu si l'offre ne l'inclut pas).
MODULES_PAR_FONCTION = {"transferts": "transferts", "facturation": "facturation"}
NOMS_FONCTIONS = {"transferts": "les transferts entre dépôts", "facturation": "les devis, bons de livraison et factures",
                  "approbation": "l'approbation par code PIN"}


class FonctionHorsOffre(APIException):
    status_code = 403
    default_code = "offre"


def offre_courante():
    """Code de l'offre de la licence installée (toutes les fonctions hors contrôle de licence, ex. tests)."""
    if not getattr(settings, "LICENCE_OBLIGATOIRE", True):
        return RESEAU
    from .services import etat_licence

    offre = etat_licence().get("offre")
    return offre if offre in OFFRES else PRO


def definition():
    return OFFRES[offre_courante()]


def a_la_fonction(fonction):
    return fonction in definition()["fonctions"]


def message_hors_offre(precision):
    return (f"{precision[0].upper()}{precision[1:]} ne fait pas partie de votre offre {definition()['nom']}. "
            "Passez à l'offre supérieure : contactez Rawafid Digital Services.")


def exiger_fonction(fonction):
    if not a_la_fonction(fonction):
        raise FonctionHorsOffre({"detail": message_hors_offre(NOMS_FONCTIONS.get(fonction, fonction)), "code": "offre"})


def modules_autorises(modules):
    """Retire du menu les modules dont la fonction n'est pas dans l'offre."""
    retires = {m for f, m in MODULES_PAR_FONCTION.items() if not a_la_fonction(f)}
    return [m for m in modules if m not in retires]
