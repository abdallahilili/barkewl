from decimal import Decimal

from django.db.models import Count, DecimalField, ExpressionWrapper, F, Q, Sum, Value
from django.db.models.functions import Coalesce, TruncDate
from django.utils import timezone
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.achats.models import Achat
from apps.caisse.models import SessionCaisse
from apps.caisse.serializers import SessionCaisseSerializer
from apps.commun.constantes import ADMIN, CAISSIER, MAGASINIER, TOUS_LES_ROLES
from apps.commun.exceptions import ErreurMetier
from apps.commun.utilitaires import plage_dates
from apps.stock import alertes
from apps.stock.models import MouvementStock, Stock, TypeMouvement
from apps.stock.serializers import MouvementStockSerializer
from apps.ventes.models import Vente
from apps.ventes.serializers import VenteListeSerializer

MONNAIE = DecimalField(max_digits=18, decimal_places=2)
ZERO = Value(Decimal("0"), output_field=MONNAIE)


def _somme(champ, **kw):
    return Coalesce(Sum(champ, **kw), ZERO, output_field=MONNAIE)


class RapportVentesView(APIView):
    """Ventes par jour, caissier, dépôt ou médicament (chiffre d'affaires)."""

    roles_lecture = ()

    def get(self, request):
        debut, fin = plage_dates(request.query_params)
        regroupement = request.query_params.get("regroupement", "jour")
        ventes = Vente.objects.filter(statut="VALIDEE", date_vente__date__range=(debut, fin))
        if request.query_params.get("depot"):
            ventes = ventes.filter(depot_id=request.query_params["depot"])
        if request.query_params.get("caissier"):
            ventes = ventes.filter(caissier_id=request.query_params["caissier"])

        if regroupement == "jour":
            lignes = ventes.annotate(cle=TruncDate("date_vente")).values("cle").annotate(
                nombre=Count("id"), total=_somme("total")).order_by("cle")
            lignes = [{"libelle": str(l["cle"]), "nombre": l["nombre"], "total": l["total"]} for l in lignes]
        elif regroupement == "caissier":
            lignes = ventes.values("caissier__prenom", "caissier__nom").annotate(
                nombre=Count("id"), total=_somme("total")).order_by("-total")
            lignes = [{"libelle": f'{l["caissier__prenom"]} {l["caissier__nom"]}'.strip(), "nombre": l["nombre"], "total": l["total"]} for l in lignes]
        elif regroupement == "depot":
            lignes = ventes.values("depot__nom").annotate(nombre=Count("id"), total=_somme("total")).order_by("-total")
            lignes = [{"libelle": l["depot__nom"], "nombre": l["nombre"], "total": l["total"]} for l in lignes]
        elif regroupement == "medicament":
            from apps.ventes.models import LigneVente

            lv = LigneVente.objects.filter(vente__in=ventes).values("medicament__nom").annotate(
                nombre=Sum("quantite"), total=_somme("total")).order_by("-total")
            lignes = [{"libelle": l["medicament__nom"], "nombre": l["nombre"], "total": l["total"]} for l in lv]
        else:
            raise ErreurMetier("Regroupement inconnu (jour, caissier, depot, medicament).")

        agregat = ventes.aggregate(nombre=Count("id"), total=_somme("total"))
        return Response({"date_debut": debut, "date_fin": fin, "regroupement": regroupement, "lignes": lignes,
                         "nombre_ventes": agregat["nombre"], "chiffre_affaires": agregat["total"]})


class RapportAchatsView(APIView):
    roles_lecture = ()

    def get(self, request):
        debut, fin = plage_dates(request.query_params)
        regroupement = request.query_params.get("regroupement", "jour")
        achats = Achat.objects.filter(statut="VALIDE", date_achat__range=(debut, fin))
        if regroupement == "jour":
            qs = achats.values("date_achat").annotate(nombre=Count("id"), total=_somme("total"), paye=_somme("montant_paye")).order_by("date_achat")
            lignes = [{"libelle": str(l["date_achat"]), "nombre": l["nombre"], "total": l["total"], "paye": l["paye"]} for l in qs]
        elif regroupement == "fournisseur":
            qs = achats.values("fournisseur__nom").annotate(nombre=Count("id"), total=_somme("total"), paye=_somme("montant_paye")).order_by("-total")
            lignes = [{"libelle": l["fournisseur__nom"], "nombre": l["nombre"], "total": l["total"], "paye": l["paye"]} for l in qs]
        else:
            raise ErreurMetier("Regroupement inconnu (jour, fournisseur).")
        for l in lignes:
            l["reste"] = l["total"] - l["paye"]
        agregat = achats.aggregate(nombre=Count("id"), total=_somme("total"), paye=_somme("montant_paye"))
        return Response({"date_debut": debut, "date_fin": fin, "regroupement": regroupement, "lignes": lignes,
                         "nombre_achats": agregat["nombre"], "total_achats": agregat["total"],
                         "total_paye": agregat["paye"], "reste_a_payer": agregat["total"] - agregat["paye"]})


class RapportCaisseView(APIView):
    roles_lecture = ()

    def get(self, request):
        debut, fin = plage_dates(request.query_params)
        sessions = SessionCaisse.objects.filter(date_ouverture__date__range=(debut, fin)).select_related("caissier", "caisse__depot")
        if request.query_params.get("caissier"):
            sessions = sessions.filter(caissier_id=request.query_params["caissier"])
        donnees = SessionCaisseSerializer(sessions, many=True, context={"request": request}).data
        fermees = sessions.filter(statut="FERMEE")
        agregat = fermees.aggregate(
            ventes=_somme("total_ventes"), especes=_somme("total_especes"), autres=_somme("total_autres_paiements"),
            ecarts=_somme("ecart"), ecarts_negatifs=_somme("ecart", filter=Q(ecart__lt=0)),
        )
        return Response({"date_debut": debut, "date_fin": fin, "sessions": donnees,
                         "total_ventes": agregat["ventes"], "total_especes": agregat["especes"],
                         "total_autres_paiements": agregat["autres"], "total_ecarts": agregat["ecarts"],
                         "total_manquants": agregat["ecarts_negatifs"]})


CATEGORIES_MOUVEMENTS = {
    "entrees": [TypeMouvement.ENTREE, TypeMouvement.RETOUR],
    "sorties": [TypeMouvement.SORTIE, TypeMouvement.VENTE, TypeMouvement.PERTE, TypeMouvement.PEREMPTION,
                TypeMouvement.ENDOMMAGE, TypeMouvement.CONSOMMATION_INTERNE],
    "transferts": [TypeMouvement.TRANSFERT_ENTREE, TypeMouvement.TRANSFERT_SORTIE],
    "ajustements": [TypeMouvement.AJUSTEMENT, TypeMouvement.INVENTAIRE],
}


class RapportMouvementsView(APIView):
    """Mouvements de stock : entrées, sorties, transferts, ajustements."""

    roles_lecture = (MAGASINIER,)

    def get(self, request):
        debut, fin = plage_dates(request.query_params, 30)
        mouvements = MouvementStock.objects.filter(date_mouvement__date__range=(debut, fin))
        categorie = request.query_params.get("categorie")
        if categorie:
            if categorie not in CATEGORIES_MOUVEMENTS:
                raise ErreurMetier("Catégorie inconnue (entrees, sorties, transferts, ajustements).")
            mouvements = mouvements.filter(type_mouvement__in=CATEGORIES_MOUVEMENTS[categorie])
        if request.query_params.get("depot"):
            mouvements = mouvements.filter(depot_id=request.query_params["depot"])
        synthese = (
            mouvements.values("type_mouvement")
            .annotate(nombre=Count("id"), quantite_totale=Sum("quantite"))
            .order_by("type_mouvement")
        )
        libelles = dict(TypeMouvement.choices)
        recents = mouvements.select_related("utilisateur", "medicament", "lot", "depot").order_by("-date_mouvement", "-id")[:200]
        return Response({
            "date_debut": debut, "date_fin": fin, "categorie": categorie,
            "synthese": [{"type_mouvement": s["type_mouvement"], "libelle": libelles[s["type_mouvement"]],
                          "nombre": s["nombre"], "quantite": s["quantite_totale"]} for s in synthese],
            "mouvements": MouvementStockSerializer(recents, many=True).data,
        })


class RapportStockView(APIView):
    """?type=etat|valeur|faible|ruptures|peremption"""

    roles_lecture = (MAGASINIER,)

    def get(self, request):
        type_rapport = request.query_params.get("type", "etat")
        depot_id = request.query_params.get("depot")
        from apps.depots.models import Depot

        depot = Depot.objects.filter(pk=depot_id).first() if depot_id else None
        alerte = alertes.construire_alertes(depot, limite=1000)
        if type_rapport == "valeur":
            valeur = ExpressionWrapper(F("quantite") * F("lot__prix_achat"), output_field=MONNAIE)
            base = Stock.objects.filter(quantite__gt=0)
            if depot:
                base = base.filter(depot=depot)
            par_depot = base.values("depot__nom").annotate(quantite_totale=Sum("quantite"), valeur_totale=_somme(valeur)).order_by("depot__nom")
            par_categorie = base.values("lot__medicament__categorie__nom").annotate(
                quantite_totale=Sum("quantite"), valeur_totale=_somme(valeur)).order_by("-valeur_totale")
            return Response({
                "synthese": alertes.calculer_synthese(depot),
                "par_depot": [{"libelle": l["depot__nom"], "quantite": l["quantite_totale"], "valeur": l["valeur_totale"]} for l in par_depot],
                "par_categorie": [{"libelle": l["lot__medicament__categorie__nom"] or "Sans catégorie",
                                   "quantite": l["quantite_totale"], "valeur": l["valeur_totale"]} for l in par_categorie],
            })
        if type_rapport == "faible":
            return Response({"lignes": alerte["stock_faible"]})
        if type_rapport == "ruptures":
            return Response({"lignes": alerte["ruptures"]})
        if type_rapport == "peremption":
            return Response({"seuil_jours": alerte["seuil_jours_peremption"],
                             "bientot_perimes": alerte["peremption_proche"], "perimes": alerte["perimes"]})
        if type_rapport == "etat":
            base = Stock.objects.filter(quantite__gt=0).select_related("lot__medicament", "depot").order_by("lot__medicament__nom", "lot__date_peremption")
            if depot:
                base = base.filter(depot=depot)
            return Response({"lignes": [
                {"medicament": s.lot.medicament.nom, "numero_lot": s.lot.numero_lot, "depot": s.depot.nom,
                 "quantite": s.quantite, "date_peremption": s.lot.date_peremption,
                 "valeur": s.quantite * s.lot.prix_achat} for s in base[:5000]]})
        raise ErreurMetier("Type de rapport inconnu (etat, valeur, faible, ruptures, peremption).")


class TableauDeBordView(APIView):
    """Indicateurs du tableau de bord, adaptés au rôle."""

    roles_lecture = TOUS_LES_ROLES

    def get(self, request):
        role = request.user.role
        aujourdhui = timezone.localdate()
        donnees = {"date": aujourdhui, "role": role}

        if role in (ADMIN, CAISSIER):
            ventes = Vente.objects.filter(statut="VALIDEE", date_vente__date=aujourdhui)
            if role == CAISSIER:
                ventes = ventes.filter(caissier=request.user)
            agregat = ventes.aggregate(nombre=Count("id"), total=_somme("total"))
            donnees["ventes_aujourdhui"] = {"nombre": agregat["nombre"], "total": agregat["total"]}
            dernieres = ventes.select_related("client", "caissier", "depot").prefetch_related("paiements__mode_paiement").order_by("-date_vente")[:8]
            donnees["dernieres_ventes"] = VenteListeSerializer(dernieres, many=True).data
            session = SessionCaisse.objects.select_related("caisse").filter(caissier=request.user, statut="OUVERTE").first()
            if session:
                from apps.caisse.services import calculer_resume

                donnees["session_caisse"] = {
                    "id": session.pk, "caisse": session.caisse.nom, "date_ouverture": session.date_ouverture,
                    "montant_attendu": calculer_resume(session)["montant_attendu"],
                }
            else:
                donnees["session_caisse"] = None

        if role == ADMIN:
            achats = Achat.objects.filter(statut="VALIDE", date_achat=aujourdhui).aggregate(nombre=Count("id"), total=_somme("total"))
            donnees["achats_aujourdhui"] = {"nombre": achats["nombre"], "total": achats["total"]}
            donnees["dettes_fournisseurs"] = Achat.objects.filter(statut="VALIDE").aggregate(
                t=_somme(ExpressionWrapper(F("total") - F("montant_paye"), output_field=MONNAIE)))["t"]

        if role in (ADMIN, MAGASINIER):
            donnees["stock"] = alertes.calculer_synthese()
            alerte = alertes.construire_alertes(limite=8)
            donnees["alertes"] = {k: alerte[k] for k in ("stock_faible", "ruptures", "peremption_proche", "perimes")}
            recents = MouvementStock.objects.select_related("utilisateur", "medicament", "lot", "depot")[:8]
            donnees["derniers_mouvements"] = MouvementStockSerializer(recents, many=True).data
        else:
            synth = alertes.calculer_synthese()
            donnees["stock"] = {k: synth[k] for k in ("nombre_ruptures", "nombre_stock_faible", "nombre_bientot_perimes", "nombre_perimes")}
        return Response(donnees)
