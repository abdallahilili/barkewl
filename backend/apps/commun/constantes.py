from django.db import models

ADMIN = "ADMIN"
CAISSIER = "CAISSIER"
MAGASINIER = "MAGASINIER"

ROLES = [
    (ADMIN, "Administrateur"),
    (CAISSIER, "Caissier"),
    (MAGASINIER, "Magasinier"),
]

TOUS_LES_ROLES = (ADMIN, CAISSIER, MAGASINIER)

# Modules de l'interface accessibles selon le rôle (le backend reste l'autorité :
# chaque vue vérifie aussi les rôles autorisés).
MODULES_PAR_ROLE = {
    ADMIN: [
        "tableau_de_bord", "ventes", "stock_etat", "stock_gestion", "medicaments",
        "lots", "achats", "caisse", "depots", "rapports", "administration",
    ],
    CAISSIER: ["tableau_de_bord", "ventes", "stock_etat", "caisse"],
    MAGASINIER: ["tableau_de_bord", "stock_etat", "stock_gestion", "medicaments", "lots"],
}


class StatutDocument(models.TextChoices):
    BROUILLON = "BROUILLON", "Brouillon"
    VALIDE = "VALIDE", "Validé"
    ANNULE = "ANNULE", "Annulé"
