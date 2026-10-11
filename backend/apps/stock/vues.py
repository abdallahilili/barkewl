from datetime import timedelta

from django.db.models import F, IntegerField, OuterRef, Q, Subquery, Sum, Value
from django.db.models.functions import Coalesce
from django.utils import timezone
from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.commun.constantes import ADMIN, MAGASINIER, TOUS_LES_ROLES, StatutDocument
from apps.commun.exceptions import ErreurMetier
from apps.commun.parametres import obtenir_entier
from apps.commun.utilitaires import lire_date
from apps.commun.vues_base import ViewSetLecture

from . import alertes, services
from .models import Inventaire, MouvementStock, Stock, Transfert
from .serializers import (
    EntreeStockSerializer, InventaireDetailSerializer, InventaireSerializer, MouvementStockSerializer,
    SaisieInventaireSerializer, SortieStockSerializer, StockSerializer, TransfertSerializer,
)


class StockViewSet(ViewSetLecture):
    """État du stock : une ligne par lot et par dépôt."""

    serializer_class = StockSerializer
    roles_lecture = TOUS_LES_ROLES
    roles_ecriture = (MAGASINIER,)
    search_fields = [
        "lot__medicament__nom", "lot__medicament__nom_generique", "lot__medicament__code",
        "lot__medicament__code_barre", "lot__numero_lot",
    ]
    ordering_fields = ["lot__medicament__nom", "quantite", "lot__date_peremption", "depot__nom"]
    ordering = ["lot__medicament__nom", "lot__date_peremption"]

    def get_queryset(self):
        total = (
            Stock.objects.filter(depot=OuterRef("depot"), lot__medicament=OuterRef("lot__medicament"))
            .values("depot").annotate(t=Sum("quantite")).values("t")
        )
        qs = Stock.objects.select_related("lot__medicament__categorie", "depot").annotate(
            total_medicament_depot=Coalesce(Subquery(total, output_field=IntegerField()), Value(0))
        )
        p = self.request.query_params
        aujourdhui = timezone.localdate()
        limite = aujourdhui + timedelta(days=obtenir_entier("jours_alerte_peremption"))
        if p.get("depot"):
            qs = qs.filter(depot_id=p["depot"])
        if p.get("medicament"):
            qs = qs.filter(lot__medicament_id=p["medicament"])
        if p.get("categorie"):
            qs = qs.filter(lot__medicament__categorie_id=p["categorie"])
        if p.get("lot"):
            qs = qs.filter(lot__numero_lot__icontains=p["lot"])
        if p.get("rupture") == "1":
            qs = qs.filter(quantite__lte=0, total_medicament_depot__lte=0)
        elif p.get("inclure_zero") != "1":
            qs = qs.filter(quantite__gt=0)
        if p.get("stock_faible") == "1":
            qs = qs.filter(quantite__gt=0, lot__medicament__stock_minimum__gt=0,
                           total_medicament_depot__lte=F("lot__medicament__stock_minimum"))
        if p.get("proche_peremption") == "1":
            qs = qs.filter(quantite__gt=0, lot__date_peremption__gte=aujourdhui, lot__date_peremption__lte=limite)
        if p.get("perime") == "1":
            qs = qs.filter(quantite__gt=0, lot__date_peremption__lt=aujourdhui)
        return qs

    @action(detail=False, methods=["get"], url_path="synthese")
    def synthese(self, request):
        depot = request.query_params.get("depot") or None
        from apps.depots.models import Depot

        return Response(alertes.calculer_synthese(Depot.objects.filter(pk=depot).first() if depot else None))

    @action(detail=False, methods=["post"], url_path="entree")
    def entree(self, request):
        serializer = EntreeStockSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        d = serializer.validated_data
        mouvement = services.enregistrer_entree(
            utilisateur=request.user, medicament=d["medicament"], numero_lot=d["numero_lot"].strip(),
            date_peremption=d["date_peremption"], depot=d["depot"], quantite=d["quantite"], motif_code=d["motif"],
            date_fabrication=d.get("date_fabrication"), prix_achat=d.get("prix_achat"),
            prix_vente=d.get("prix_vente"), note=d.get("note", ""),
        )
        return Response(MouvementStockSerializer(mouvement).data, status=201)

    @action(detail=False, methods=["post"], url_path="sortie")
    def sortie(self, request):
        serializer = SortieStockSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        d = serializer.validated_data
        mouvement = services.enregistrer_sortie(
            utilisateur=request.user, lot=d["lot"], depot=d["depot"], quantite=d["quantite"],
            motif_code=d["motif"], note=d.get("note", ""),
        )
        return Response(MouvementStockSerializer(mouvement).data, status=201)


class MouvementStockViewSet(ViewSetLecture):
    """Historique du stock (lecture seule : aucune modification ni suppression possible)."""

    serializer_class = MouvementStockSerializer
    roles_lecture = (MAGASINIER,)
    roles_ecriture = ()
    search_fields = ["medicament__nom", "lot__numero_lot", "reference", "motif"]
    ordering_fields = ["date_mouvement", "quantite", "type_mouvement", "medicament__nom"]
    ordering = ["-date_mouvement", "-id"]

    def get_queryset(self):
        qs = MouvementStock.objects.select_related("utilisateur", "medicament", "lot", "depot")
        p = self.request.query_params
        for parametre, champ in (("medicament", "medicament_id"), ("lot", "lot_id"), ("depot", "depot_id"),
                                 ("utilisateur", "utilisateur_id"), ("type_mouvement", "type_mouvement"),
                                 ("reference", "reference")):
            if p.get(parametre):
                qs = qs.filter(**{champ: p[parametre]})
        if p.get("sens") == "entree":
            qs = qs.filter(quantite__gt=0)
        elif p.get("sens") == "sortie":
            qs = qs.filter(quantite__lt=0)
        debut, fin = lire_date(p.get("date_debut")), lire_date(p.get("date_fin"))
        if debut:
            qs = qs.filter(date_mouvement__date__gte=debut)
        if fin:
            qs = qs.filter(date_mouvement__date__lte=fin)
        return qs


class TransfertViewSet(viewsets.ModelViewSet):
    serializer_class = TransfertSerializer
    roles_lecture = (MAGASINIER,)
    roles_ecriture = (MAGASINIER,)
    http_method_names = ["get", "post", "put", "patch", "head", "options"]
    search_fields = ["reference", "note", "depot_source__nom", "depot_destination__nom"]
    ordering_fields = ["date_transfert", "reference", "statut"]
    ordering = ["-date_transfert", "-id"]

    def get_queryset(self):
        qs = Transfert.objects.select_related("utilisateur", "depot_source", "depot_destination").prefetch_related(
            "lignes__lot__medicament"
        )
        if self.request.query_params.get("statut"):
            qs = qs.filter(statut=self.request.query_params["statut"])
        return qs

    @action(detail=True, methods=["post"], url_path="valider")
    def valider(self, request, pk=None):
        self.get_object()
        transfert = services.valider_transfert(pk, request.user)
        return Response(self.get_serializer(self.get_queryset().get(pk=transfert.pk)).data)

    @action(detail=True, methods=["post"], url_path="annuler")
    def annuler(self, request, pk=None):
        self.get_object()
        transfert = services.annuler_transfert(pk, request.user)
        return Response(self.get_serializer(self.get_queryset().get(pk=transfert.pk)).data)


class InventaireViewSet(viewsets.ModelViewSet):
    roles_lecture = (MAGASINIER,)
    roles_ecriture = (MAGASINIER,)
    http_method_names = ["get", "post", "head", "options"]
    search_fields = ["reference", "note", "depot__nom"]
    ordering_fields = ["date_creation", "reference", "statut"]
    ordering = ["-date_creation", "-id"]

    def get_serializer_class(self):
        return InventaireDetailSerializer if self.action == "retrieve" else InventaireSerializer

    def get_queryset(self):
        qs = Inventaire.objects.select_related("depot", "utilisateur").prefetch_related("lignes__lot__medicament")
        if self.request.query_params.get("statut"):
            qs = qs.filter(statut=self.request.query_params["statut"])
        return qs

    def create(self, request, *args, **kwargs):
        serializer = InventaireSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        inventaire = services.creer_inventaire(
            depot=serializer.validated_data["depot"], utilisateur=request.user,
            note=serializer.validated_data.get("note", ""),
        )
        return Response(InventaireDetailSerializer(self.get_queryset().get(pk=inventaire.pk)).data, status=201)

    @action(detail=True, methods=["post"], url_path="recharger")
    def recharger(self, request, pk=None):
        inventaire = self.get_object()
        services.charger_stock_theorique(inventaire)
        return Response(InventaireDetailSerializer(self.get_queryset().get(pk=pk)).data)

    @action(detail=True, methods=["post"], url_path="saisir")
    def saisir(self, request, pk=None):
        inventaire = self.get_object()
        if inventaire.statut != StatutDocument.BROUILLON:
            raise ErreurMetier("Seul un inventaire en brouillon peut être modifié.")
        serializer = SaisieInventaireSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        lignes = {l.id: l for l in inventaire.lignes.all()}
        for identifiant, quantite in serializer.validated_data["lignes"]:
            ligne = lignes.get(identifiant)
            if ligne is None:
                raise ErreurMetier(f"La ligne {identifiant} n'appartient pas à cet inventaire.")
            ligne.quantite_physique = quantite
            ligne.save(update_fields=["quantite_physique"])
        return Response(InventaireDetailSerializer(self.get_queryset().get(pk=pk)).data)

    @action(detail=True, methods=["post"], url_path="valider")
    def valider(self, request, pk=None):
        self.get_object()
        services.valider_inventaire(pk, request.user)
        return Response(InventaireDetailSerializer(self.get_queryset().get(pk=pk)).data)

    @action(detail=True, methods=["post"], url_path="annuler")
    def annuler(self, request, pk=None):
        inventaire = self.get_object()
        if inventaire.statut != StatutDocument.BROUILLON:
            raise ErreurMetier("Seul un inventaire en brouillon peut être annulé.")
        inventaire.statut = StatutDocument.ANNULE
        inventaire.save(update_fields=["statut"])
        from apps.commun.audit import enregistrer_audit

        enregistrer_audit(request.user, "ANNULATION", "Inventaire", inventaire.pk, reference=inventaire.reference)
        return Response(InventaireDetailSerializer(self.get_queryset().get(pk=pk)).data)


class AlertesView(APIView):
    roles_lecture = TOUS_LES_ROLES
    roles_ecriture = ()

    def get(self, request):
        from apps.depots.models import Depot

        depot = Depot.objects.filter(pk=request.query_params.get("depot")).first() if request.query_params.get("depot") else None
        return Response(alertes.construire_alertes(depot))
