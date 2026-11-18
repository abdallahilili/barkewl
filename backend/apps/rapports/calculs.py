"""
Calculs partagés des rapports : chiffre d'affaires net des retours, coût d'achat des produits vendus.

Règles :
  - le chiffre d'affaires est celui des ventes validées de la période, MOINS les retours clients faits dans la
    période (un retour est daté du jour où le client rend l'article, pas du jour de la vente d'origine) ;
  - le coût d'achat d'une ligne = unités vendues × prix d'achat du lot ÷ unités par boîte ;
  - un retour revendable remet le produit en stock : son coût d'achat est retiré du coût des ventes ;
    un retour non revendable est une perte : son coût reste dans le coût des ventes.
"""
from datetime import timedelta
from decimal import Decimal

from django.db.models import DecimalField, ExpressionWrapper, F, Sum, Value
from django.db.models.functions import Coalesce
from django.utils import timezone

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


MOIS_CMM = 3


def nombre_de_mois(debut, fin):
    """Nombre de mois d'une période (jours comptés des deux côtés ÷ 30, arrondi à 0,1), jamais moins de 1 :
    du 1er janvier au 31 mars = 3 mois ; une semaine compte pour 1 mois (pas d'extrapolation hasardeuse)."""
    mois = (Decimal((fin - debut).days + 1) / 30).quantize(Decimal("0.1"))
    return max(mois, Decimal("1"))


def cmm_principaux(limite=8, mois=MOIS_CMM):
    """
    CMM (consommation moyenne mensuelle) : quantité vendue par mois en moyenne sur les `mois` derniers mois
    (30 jours par mois), nette des retours clients. Pour chaque produit : la CMM (en boîtes) et la couverture,
    c'est-à-dire le nombre de mois que le stock actuel permet de tenir à ce rythme.
    Renvoie les `limite` produits qui se consomment le plus.
    """
    from apps.medicaments.conditionnement import decrire_quantite
    from apps.medicaments.models import Medicament
    from apps.stock.models import Stock

    fin = timezone.localdate()
    debut = fin - timedelta(days=30 * mois)
    vendu = (LigneVente.objects.filter(vente__in=ventes_validees(debut, fin)).values("medicament_id")
             .annotate(vendues=Sum(F("quantite") * F("unites_par_conditionnement"))))
    rendu = (LigneRetourVente.objects.filter(retour__in=retours_periode(debut, fin))
             .values("ligne_vente__medicament_id").annotate(rendues=Sum("unites")))
    unites = {l["medicament_id"]: l["vendues"] for l in vendu}
    for l in rendu:
        unites[l["ligne_vente__medicament_id"]] = unites.get(l["ligne_vente__medicament_id"], 0) - l["rendues"]
    unites = {i: u for i, u in unites.items() if u > 0}
    medicaments = Medicament.objects.in_bulk(list(unites))
    classes = sorted(unites, key=lambda i: Decimal(unites[i]) / medicaments[i].unites_par_boite, reverse=True)
    retenus = classes[:limite]
    en_stock = {l["lot__medicament_id"]: l["total"] for l in
                Stock.objects.filter(lot__medicament_id__in=retenus).values("lot__medicament_id").annotate(total=Sum("quantite"))}
    lignes = []
    for i in retenus:
        m = medicaments[i]
        par_mois = Decimal(unites[i]) / mois                      # unités par mois
        stock = max(en_stock.get(i, 0), 0)
        lignes.append({
            "medicament": f"{m.nom} {m.dosage}".strip(),
            "cmm": (par_mois / m.unites_par_boite).quantize(Decimal("0.1")),     # boîtes par mois
            "stock_texte": decrire_quantite(m, stock),
            "couverture_mois": (Decimal(stock) / par_mois).quantize(Decimal("0.1")),
        })
    return {"mois": mois, "nombre_produits": len(unites), "lignes": lignes}
