"""
Calculs partagés des rapports : chiffre d'affaires net des retours, coût d'achat des produits vendus.

Règles :
  - le chiffre d'affaires est celui des ventes validées de la période, MOINS les retours clients faits dans la
    période (un retour est daté du jour où le client rend l'article, pas du jour de la vente d'origine) ;
  - le coût d'achat d'une ligne = unités vendues × prix d'achat du lot ÷ unités par boîte ;
  - un retour revendable remet le produit en stock : son coût d'achat est retiré du coût des ventes ;
    un retour non revendable est une perte : son coût reste dans le coût des ventes.
"""
from decimal import Decimal

from django.db.models import DecimalField, ExpressionWrapper, F, Sum, Value
from django.db.models.functions import Coalesce

from apps.ventes.models import EtatRetour, LigneRetourVente, LigneVente, RetourVente, Vente

MONNAIE = DecimalField(max_digits=18, decimal_places=2)
ZERO = Value(Decimal("0"), output_field=MONNAIE)

COUT_LIGNE_VENTE = ExpressionWrapper(
    F("quantite") * F("unites_par_conditionnement") * F("lot__prix_achat") / F("medicament__unites_par_boite"),
    output_field=MONNAIE,
)
COUT_LIGNE_RETOUR = ExpressionWrapper(
    F("unites") * F("ligne_vente__lot__prix_achat") / F("ligne_vente__medicament__unites_par_boite"),
    output_field=MONNAIE,
)


def somme(champ, **kw):
    return Coalesce(Sum(champ, **kw), ZERO, output_field=MONNAIE)


def ventes_validees(debut, fin, depot=None, caissier=None):
    qs = Vente.objects.filter(statut="VALIDEE", date_vente__date__range=(debut, fin))
    if depot:
        qs = qs.filter(depot_id=depot)
    if caissier:
        qs = qs.filter(caissier_id=caissier)
    return qs


def retours_periode(debut, fin, depot=None, caissier=None):
    qs = RetourVente.objects.filter(date_retour__date__range=(debut, fin))
    if depot:
        qs = qs.filter(vente__depot_id=depot)
    if caissier:
        qs = qs.filter(vente__caissier_id=caissier)
    return qs


def total_retours(debut, fin, depot=None, caissier=None):
    return retours_periode(debut, fin, depot, caissier).aggregate(t=somme("total"))["t"]


def cout_achat_ventes(debut, fin, depot=None):
    """Coût d'achat des produits vendus dans la période, net des retours revendables (remis en stock)."""
    lignes = LigneVente.objects.filter(vente__in=ventes_validees(debut, fin, depot))
    vendu = lignes.aggregate(t=somme(COUT_LIGNE_VENTE))["t"]
    retours = LigneRetourVente.objects.filter(retour__in=retours_periode(debut, fin, depot), etat=EtatRetour.REVENDABLE)
    remis_en_stock = retours.aggregate(t=somme(COUT_LIGNE_RETOUR))["t"]
    return vendu - remis_en_stock
