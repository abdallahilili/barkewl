from django.db import models

# Les codes restent ceux d'origine (aucune donnée à migrer) ; seuls les libellés ont évolué.
ADMIN = "ADMIN"                # Propriétaire : tout
PHARMACIEN = "PHARMACIEN"      # Pharmacien : vend + gère le stock + approuve les annulations ; ni prix d'achat ni réglages
CAISSIER = "CAISSIER"          # Vendeur : vend et encaisse
MAGASINIER = "MAGASINIER"      # Magasinier : réceptions, stock, inventaires

ROLES = [
    (ADMIN, "Propriétaire"),
    (PHARMACIEN, "Pharmacien"),
    (CAISSIER, "Vendeur"),
    (MAGASINIER, "Magasinier"),
]

TOUS_LES_ROLES = (ADMIN, PHARMACIEN, CAISSIER, MAGASINIER)

# Le pharmacien cumule les droits du vendeur et du magasinier (en plus des siens).
ROLES_INCLUS = {PHARMACIEN: (CAISSIER, MAGASINIER)}

# Rôles qui peuvent approuver une opération sensible avec leur code PIN (ex. annulation d'une vente).
ROLES_APPROBATEURS = (ADMIN, PHARMACIEN)

# Rôles qui ne voient ni les prix d'achat, ni la valeur du stock, ni les marges.
ROLES_SANS_PRIX_ACHAT = (CAISSIER, PHARMACIEN)


def roles_effectifs(role):
    """Le rôle et ceux qu'il inclut : {PHARMACIEN, CAISSIER, MAGASINIER} pour un pharmacien."""
    return {role, *ROLES_INCLUS.get(role, ())}


# Modules de l'interface accessibles selon le rôle (le backend reste l'autorité :
# chaque vue vérifie aussi les rôles autorisés). L'offre de la licence peut en retirer certains.
MODULES_PAR_ROLE = {
    ADMIN: [
        "tableau_de_bord", "ventes", "stock_etat", "stock_gestion", "transferts", "medicaments",
        "lots", "achats", "caisse", "depenses", "facturation", "depots", "rapports", "administration",
    ],
    PHARMACIEN: ["tableau_de_bord", "ventes", "stock_etat", "stock_gestion", "transferts", "medicaments", "lots",
                 "caisse", "facturation"],
    CAISSIER: ["tableau_de_bord", "ventes", "stock_etat", "caisse", "facturation"],
    MAGASINIER: ["tableau_de_bord", "stock_etat", "stock_gestion", "transferts", "medicaments", "lots", "facturation"],
}


class StatutDocument(models.TextChoices):
    BROUILLON = "BROUILLON", "Brouillon"
    VALIDE = "VALIDE", "Validé"
    ANNULE = "ANNULE", "Annulé"
