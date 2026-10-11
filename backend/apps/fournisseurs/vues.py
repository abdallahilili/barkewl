from django.db.models import DecimalField, ExpressionWrapper, F, Q, Sum, Value
from django.db.models.functions import Coalesce
from rest_framework.decorators import action
from rest_framework.response import Response

from apps.commun.vues_base import ViewSetGestion, ViewSetLecture

from .models import Fournisseur, PaiementFournisseur
from .serializers import FournisseurSerializer, PaiementFournisseurSerializer


class FournisseurViewSet(ViewSetGestion):
    """Fournisseurs et achats : administrateur uniquement."""

    serializer_class = FournisseurSerializer
    roles_lecture = ()
    roles_ecriture = ()
    search_fields = ["nom", "telephone", "email", "identifiant_fiscal"]
    ordering_fields = ["nom", "date_creation", "solde"]
    ordering = ["nom"]

    def get_queryset(self):
        dette = ExpressionWrapper(F("achats__total") - F("achats__montant_paye"),
                                  output_field=DecimalField(max_digits=16, decimal_places=2))
        qs = Fournisseur.objects.annotate(
            solde=Coalesce(Sum(dette, filter=Q(achats__statut="VALIDE")), Value(0),
                           output_field=DecimalField(max_digits=16, decimal_places=2))
        )
        if self.request.query_params.get("actif") in ("0", "1"):
            qs = qs.filter(actif=(self.request.query_params["actif"] == "1"))
        return qs

    @action(detail=True, methods=["get"], url_path="historique-achats")
    def historique_achats(self, request, pk=None):
        from apps.achats.models import Achat
        from apps.achats.serializers import AchatListeSerializer

        fournisseur = self.get_object()
        achats = Achat.objects.filter(fournisseur=fournisseur).select_related("fournisseur", "depot", "utilisateur").order_by("-date_achat", "-id")
        page = self.paginate_queryset(achats)
        return self.get_paginated_response(AchatListeSerializer(page, many=True).data)


class PaiementFournisseurViewSet(ViewSetLecture):
    queryset = PaiementFournisseur.objects.select_related("fournisseur", "achat", "mode_paiement", "utilisateur")
    serializer_class = PaiementFournisseurSerializer
    roles_lecture = ()
    roles_ecriture = ()
    search_fields = ["fournisseur__nom", "achat__reference", "reference"]
    ordering = ["-date_paiement", "-id"]

    def get_queryset(self):
        qs = super().get_queryset()
        if self.request.query_params.get("fournisseur"):
            qs = qs.filter(fournisseur_id=self.request.query_params["fournisseur"])
        return qs
