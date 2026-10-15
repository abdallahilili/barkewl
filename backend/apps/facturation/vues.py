from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from apps.commun.constantes import ADMIN, CAISSIER, MAGASINIER, TOUS_LES_ROLES

from . import services
from .models import DocumentVente
from .serializers import DocumentVenteListeSerializer, DocumentVenteSerializer, PayerDocumentSerializer, ValiderBLSerializer


class DocumentVenteViewSet(viewsets.ModelViewSet):
    """Devis (brouillon, modifiable) -> Bon de livraison -> Facture -> Paiement.
    Création/modification du devis : requête standard (POST/PUT/PATCH). Les transitions
    d'étape passent par des actions dédiées, chacune déléguée à services.py (tout ou rien)."""

    roles_lecture = TOUS_LES_ROLES
    roles_ecriture = (ADMIN, MAGASINIER)
    roles_par_action = {
        "annuler": (ADMIN, MAGASINIER),
        "valider_bl": (ADMIN, MAGASINIER),
        "valider_facture": (ADMIN,),
        "payer": (ADMIN, CAISSIER),
    }
    http_method_names = ["get", "post", "put", "patch", "head", "options"]
    search_fields = ["reference", "numero_bl", "numero_facture", "client__nom"]
    ordering_fields = ["date_devis", "reference", "total", "etape"]
    ordering = ["-date_devis", "-id"]

    def get_serializer_class(self):
        return DocumentVenteListeSerializer if self.action == "list" else DocumentVenteSerializer

    def get_queryset(self):
        qs = DocumentVente.objects.select_related("client", "depot", "personnel").prefetch_related(
            "lignes__medicament", "paiements__mode_paiement", "paiements__utilisateur"
        )
        p = self.request.query_params
        if p.get("etape"):
            qs = qs.filter(etape=p["etape"])
        if p.get("client"):
            qs = qs.filter(client_id=p["client"])
        if p.get("annule") in ("0", "1"):
            qs = qs.filter(annule=(p["annule"] == "1"))
        return qs

    def _reponse(self, pk):
        document = self.get_queryset().get(pk=pk)
        return Response(DocumentVenteSerializer(document, context=self.get_serializer_context()).data)

    @action(detail=True, methods=["post"])
    def annuler(self, request, pk=None):
        self.get_object()
        services.annuler_devis(pk, request.user)
        return self._reponse(pk)

    @action(detail=True, methods=["post"], url_path="valider-bl")
    def valider_bl(self, request, pk=None):
        self.get_object()
        serializer = ValiderBLSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        quantites = {l["ligne"]: l["quantite_livree"] for l in serializer.validated_data.get("lignes", [])}
        services.valider_bon_livraison(pk, request.user, quantites)
        return self._reponse(pk)

    @action(detail=True, methods=["post"], url_path="valider-facture")
    def valider_facture(self, request, pk=None):
        self.get_object()
        services.valider_facture(pk, request.user)
        return self._reponse(pk)

    @action(detail=True, methods=["post"])
    def payer(self, request, pk=None):
        self.get_object()
        serializer = PayerDocumentSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        d = serializer.validated_data
        services.payer_facture(pk, request.user, d["montant"], d["mode_paiement"])
        return self._reponse(pk)
