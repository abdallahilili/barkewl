"""Paramètres configurables par l'administrateur (avec valeurs par défaut)."""

DEFAUTS = {
    "stock_negatif_autorise": ("0", "Autoriser un stock négatif (1 = oui, 0 = non)"),
    "jours_alerte_peremption": ("90", "Nombre de jours avant péremption pour l'alerte « bientôt périmé »"),
    "nom_pharmacie": ("PHARMACIE", "Nom affiché sur les reçus"),
    "adresse_pharmacie": ("", "Adresse affichée sur les reçus"),
    "telephone_pharmacie": ("", "Téléphone affiché sur les reçus"),
    "telephone_pharmacie_2": ("", "Téléphone 2 affiché sur les reçus"),
    "telephone_pharmacie_3": ("", "Téléphone 3 affiché sur les reçus"),
    "devise": ("MRU", "Devise affichée sur les montants"),
    "message_recu": ("Merci de votre visite", "Message en bas du reçu"),
    "logo_pharmacie": ("", "Logo affiché sur les reçus (image encodée en base64)"),
    "gestion_rayonnages_active": ("0", "Activer la gestion des rayonnages (emplacement des médicaments) [1 = oui, 0 = non]"),
}


def obtenir_parametre(cle):
    from .models import Parametre

    valeur = Parametre.objects.filter(cle=cle).values_list("valeur", flat=True).first()
    return DEFAUTS[cle][0] if valeur is None else valeur


def obtenir_booleen(cle):
    return obtenir_parametre(cle).strip().lower() in ("1", "true", "oui", "vrai")


def obtenir_entier(cle):
    try:
        return int(obtenir_parametre(cle))
    except (TypeError, ValueError):
        return int(DEFAUTS[cle][0])


def definir_parametre(cle, valeur):
    from .models import Parametre

    Parametre.objects.update_or_create(cle=cle, defaults={"valeur": str(valeur), "description": DEFAUTS[cle][1]})
