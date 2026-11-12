from datetime import timedelta

from django.db.models import DecimalField, ExpressionWrapper, F, IntegerField, OuterRef, Q, Subquery, Sum, Value
from django.db.models.functions import Coalesce
from django.utils import timezone

from apps.commun.parametres import obtenir_entier
from apps.medicaments.conditionnement import decrire_quantite
from apps.medicaments.models import Lot, Medicament

from .models import Stock


def _lignes_en_stock(depot=None):
    qs = Stock.objects.filter(quantite__gt=0).select_related("lot__medicament", "depot")
    return qs.filter(depot=depot) if depot else qs


def medicaments_en_rupture(depot=None):
    """Médicaments actifs déjà stockés par le passé, dont le stock total est à zéro."""
    filtre = Q(lots__stocks__depot=depot) if depot else Q()
    return (
        Medicament.objects.filter(actif=True, pk__in=Lot.objects.values("medicament_id"))
        .annotate(total=Coalesce(Sum("lots__stocks__quantite", filter=filtre), Value(0)))
        .filter(total__lte=0)
    )


def medicaments_stock_faible(depot=None):
    """Stock (en unités) inférieur ou égal au seuil (en boîtes × unités par boîte)."""
    # Total calculé par sous-requête (et non par agrégat) : la comparaison avec le seuil va dans le WHERE,
    # MySQL refusant une expression sur des colonnes non groupées dans le HAVING.
    stocks = Stock.objects.filter(lot__medicament=OuterRef("pk"))
    if depot:
        stocks = stocks.filter(depot=depot)
    total = stocks.values("lot__medicament").annotate(t=Sum("quantite")).values("t")
    return (
        Medicament.objects.filter(actif=True, stock_minimum__gt=0)
        .annotate(total=Coalesce(Subquery(total, output_field=IntegerField()), Value(0)))
        .filter(total__gt=0, total__lte=F("stock_minimum") * F("unites_par_boite"))
    )


# Valeur d'une ligne de stock : quantité (unités) × prix d'achat de la boîte ÷ unités par boîte.
VALEUR_STOCK = ExpressionWrapper(
    F("quantite") * F("lot__prix_achat") / F("lot__medicament__unites_par_boite"),
    output_field=DecimalField(max_digits=18, decimal_places=2),
)


def lignes_bientot_perimees(depot=None):
    aujourdhui = timezone.localdate()
    limite = aujourdhui + timedelta(days=obtenir_entier("jours_alerte_peremption"))
    return _lignes_en_stock(depot).filter(lot__date_peremption__gte=aujourdhui, lot__date_peremption__lte=limite)


def lignes_perimees(depot=None):
    return _lignes_en_stock(depot).filter(lot__date_peremption__lt=timezone.localdate())


def calculer_synthese(depot=None):
    en_stock = _lignes_en_stock(depot)
    valeur = en_stock.aggregate(
        v=Coalesce(Sum(VALEUR_STOCK), Value(0), output_field=DecimalField(max_digits=18, decimal_places=2))
    )["v"]
    return {
        "valeur_totale": valeur,
        "nombre_medicaments": en_stock.values("lot__medicament").distinct().count(),
        "nombre_lots": en_stock.values("lot").distinct().count(),
        "nombre_ruptures": medicaments_en_rupture(depot).count(),
        "nombre_stock_faible": medicaments_stock_faible(depot).count(),
        "nombre_bientot_perimes": lignes_bientot_perimees(depot).count(),
        "nombre_perimes": lignes_perimees(depot).count(),
    }


def _ligne_peremption(stock):
    aujourdhui = timezone.localdate()
    return {
        "medicament_id": stock.lot.medicament_id, "medicament": stock.lot.medicament.nom,
        "lot_id": stock.lot_id, "numero_lot": stock.lot.numero_lot, "depot": stock.depot.nom,
        "quantite": stock.quantite, "quantite_texte": decrire_quantite(stock.lot.medicament, stock.quantite),
        "date_peremption": stock.lot.date_peremption,
        "jours_restants": (stock.lot.date_peremption - aujourdhui).days,
    }


def construire_alertes(depot=None, limite=100):
    faibles = list(medicaments_stock_faible(depot).order_by("nom")[:limite])
    ruptures = list(medicaments_en_rupture(depot).order_by("nom")[:limite])
    return {
        "seuil_jours_peremption": obtenir_entier("jours_alerte_peremption"),
        "stock_faible": [
            {"medicament_id": m.id, "medicament": m.nom, "stock": m.total, "minimum": m.stock_minimum,
             "stock_texte": decrire_quantite(m, m.total)} for m in faibles
        ],
        "ruptures": [{"medicament_id": m.id, "medicament": m.nom, "stock": 0} for m in ruptures],
        "peremption_proche": [
            _ligne_peremption(s) for s in lignes_bientot_perimees(depot).order_by("lot__date_peremption")[:limite]
        ],
        "perimes": [_ligne_peremption(s) for s in lignes_perimees(depot).order_by("lot__date_peremption")[:limite]],
    }
