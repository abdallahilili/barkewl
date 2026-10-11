from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from apps.fournisseurs.serializers import PaiementFournisseurSerializer

from . import services
from .models import Achat
from .serializers import AchatListeSerializer, AchatSerializer, PayerAchatSerializer, ValiderAchatSerializer


class AchatViewSet(viewsets.ModelViewSet):
    """Achats (factures fournisseurs) : administrateur uniquement."""

    roles_lecture = ()
    roles_ecriture = ()
    http_method_names = ["get", "post", "put", "patch", "head", "options"]
    search_fields = ["reference", "reference_facture", "fournisseur__nom"]
    ordering_fields = ["date_achat", "reference", "total", "statut", "fournisseur__nom"]
    ordering = ["-date_achat", "-id"]

    def get_serializer_class(self):
        return AchatListeSerializer if self.action == "list" else AchatSerializer

    def get_queryset(self):
        qs = Achat.objects.select_related("fournisseur", "depot", "utilisateur").prefetch_related("lignes__medicament")
        p = self.request.query_params
        for parametre, champ in (("fournisseur", "fournisseur_id"), ("depot", "depot_id"), ("statut", "statut")):
            if p.get(parametre):
                qs = qs.filter(**{champ: p[parametre]})
        if p.get("date_debut"):
            qs = qs.filter(date_achat__gte=p["date_debut"])
        if p.get("date_fin"):
            qs = qs.filter(date_achat__lte=p["date_fin"])
        if p.get("impaye") == "1":
            from django.db.models import F

            qs = qs.filter(statut="VALIDE", total__gt=F("montant_paye"))
        return qs

    def _reponse(self, pk):
        return Response(AchatSerializer(self.get_queryset().get(pk=pk), context=self.get_serializer_context()).data)

    @action(detail=True, methods=["post"], url_path="valider")
    def valider(self, request, pk=None):
        self.get_object()
        serializer = ValiderAchatSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        services.valider_achat(pk, request.user, serializer.validated_data["montant_paye"],
                               serializer.validated_data.get("mode_paiement"))
        return self._reponse(pk)

    @action(detail=True, methods=["post"], url_path="payer")
    def payer(self, request, pk=None):
        self.get_object()
        serializer = PayerAchatSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        d = serializer.validated_data
        services.payer_achat(pk, request.user, d["montant"], d.get("mode_paiement"), d.get("reference", ""), d.get("note", ""))
        return self._reponse(pk)

    @action(detail=True, methods=["post"], url_path="annuler")
    def annuler(self, request, pk=None):
        self.get_object()
        services.annuler_achat(pk, request.user)
        return self._reponse(pk)

    @action(detail=True, methods=["get"], url_path="paiements")
    def paiements(self, request, pk=None):
        achat = self.get_object()
        return Response(PaiementFournisseurSerializer(achat.paiements.select_related("fournisseur", "achat", "mode_paiement", "utilisateur"), many=True).data)
