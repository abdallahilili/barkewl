"""Paramètres configurables par l'administrateur (avec valeurs par défaut)."""

import re

DEFAUTS = {
    "stock_negatif_autorise": ("0", "Autoriser un stock négatif (1 = oui, 0 = non)"),
    "jours_alerte_peremption": ("90", "Nombre de jours avant péremption pour l'alerte « bientôt périmé »"),
    "nom_pharmacie": ("PHARMACIE", "Nom affiché sur les reçus"),
    "adresse_pharmacie": ("", "Adresse affichée sur les reçus"),
    "telephone_pharmacie": ("", "Téléphone affiché sur les reçus"),
    "telephone_pharmacie_2": ("", "Téléphone 2 affiché sur les reçus"),
    "telephone_pharmacie_3": ("", "Téléphone 3 affiché sur les reçus"),
    "whatsapp_pharmacie": ("", "WhatsApp 1 affiché sur les documents"),
    "whatsapp_pharmacie_2": ("", "WhatsApp 2 affiché sur les documents"),
    "email_pharmacie": ("", "Email affiché sur les documents"),
    "nif_pharmacie": ("", "NIF / registre de commerce affiché sur les documents"),
    "devise": ("MRU", "Devise affichée sur les montants"),
    "message_recu": ("Merci de votre visite", "Message en bas du reçu (texte riche)"),
    "message_devis": ("Devis valable 30 jours - Bon pour accord (signature du client)", "Message en bas des devis (texte riche)"),
    "message_bl": ("Merci de vérifier la conformité des quantités à la réception.", "Message en bas des bons de livraison (texte riche)"),
    "message_facture": ("", "Message en bas des factures (texte riche) ; vide = message du reçu"),
    "logo_pharmacie": ("", "Logo affiché sur les reçus (image encodée en base64)"),
    "entete_image": ("", "En-tête personnalisé des documents (image encodée en base64) ; vide = en-tête par défaut"),
    "afficher_logo_documents": ("1", "Afficher le logo sur les documents imprimés [1 = oui, 0 = non]"),
    "bl_afficher_prix": ("1", "Afficher les colonnes Prix et Total sur le bon de livraison [1 = oui, 0 = non]"),
    "gestion_rayonnages_active": ("0", "Activer la gestion des rayonnages (emplacement des médicaments) [1 = oui, 0 = non]"),
}

# Paramètres contenant une image (data URL) : jamais recopiés tels quels dans le journal d'audit.
PARAMETRES_IMAGE = ("logo_pharmacie", "entete_image")


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


def message_vide(texte):
    """Vrai si un message (texte riche HTML) ne contient rien d'imprimable."""
    return not re.sub(r"<[^>]*>|&nbsp;", " ", texte or "").strip()


def identite_documents():
    """Coordonnées de la pharmacie imprimées sur les reçus, devis, bons de livraison et factures."""
    logo = obtenir_parametre("logo_pharmacie") if obtenir_booleen("afficher_logo_documents") else ""
    return {
        "nom": obtenir_parametre("nom_pharmacie"), "adresse": obtenir_parametre("adresse_pharmacie"),
        "telephone": obtenir_parametre("telephone_pharmacie"),
        "telephone_2": obtenir_parametre("telephone_pharmacie_2"),
        "telephone_3": obtenir_parametre("telephone_pharmacie_3"),
        "whatsapp": obtenir_parametre("whatsapp_pharmacie"),
        "whatsapp_2": obtenir_parametre("whatsapp_pharmacie_2"),
        "email": obtenir_parametre("email_pharmacie"), "nif": obtenir_parametre("nif_pharmacie"),
        "devise": obtenir_parametre("devise"), "message": obtenir_parametre("message_recu"),
        "logo": logo, "entete_image": obtenir_parametre("entete_image"),
    }


def identite_documents_vente():
    """Identité des documents de vente : ajoute les messages propres au devis, au BL et à la facture."""
    message_facture = obtenir_parametre("message_facture")
    identite = identite_documents()
    identite.update({
        "message_devis": obtenir_parametre("message_devis"),
        "message_bl": obtenir_parametre("message_bl"),
        "message_facture": identite["message"] if message_vide(message_facture) else message_facture,
        "bl_afficher_prix": obtenir_booleen("bl_afficher_prix"),
    })
    return identite
