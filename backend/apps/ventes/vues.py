from django.db.models import Q
from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from apps.commun.constantes import ADMIN, CAISSIER
from apps.commun.exceptions import ErreurMetier
from apps.commun.utilitaires import lire_date
from apps.commun.vues_base import ViewSetGestion

from . import services
from .models import Client, Vente
from .serializers import (
    AnnulerVenteSerializer, ApercuVenteSerializer, ClientSerializer, CreerVenteSerializer,
    VenteListeSerializer, VenteSerializer, construire_recu,
)


class ClientViewSet(ViewSetGestion):
    queryset = Client.objects.all()
    serializer_class = ClientSerializer
    roles_lecture = (CAISSIER,)
    roles_ecriture = (CAISSIER,)
    search_fields = ["nom", "telephone"]
    ordering_fields = ["nom", "date_creation"]

    @action(detail=True, methods=["get"], url_path="historique")
    def historique(self, request, pk=None):
        client = self.get_object()
        ventes = Vente.objects.filter(client=client).select_related("client", "caissier", "depot").prefetch_related("paiements__mode_paiement")
        page = self.paginate_queryset(ventes)
        return self.get_paginated_response(VenteListeSerializer(page, many=True).data)


class VenteViewSet(viewsets.ReadOnlyModelViewSet):
    roles_lecture = (CAISSIER,)
    roles_ecriture = (CAISSIER,)
    roles_par_action = {"apercu": (CAISSIER,), "annuler": ()}
    search_fields = ["reference", "client__nom", "client__telephone"]
    ordering_fields = ["date_vente", "reference", "total", "statut"]
    ordering = ["-date_vente", "-id"]

    def get_serializer_class(self):
        return VenteListeSerializer if self.action == "list" else VenteSerializer

    def get_queryset(self):
        qs = (
            Vente.objects.select_related("client", "caissier", "depot", "annule_par")
            .prefetch_related("paiements__mode_paiement", "lignes__medicament", "lignes__lot")
        )
        if self.request.user.role == CAISSIER:
            qs = qs.filter(caissier=self.request.user)
        p = self.request.query_params
        for parametre, champ in (("caissier", "caissier_id"), ("session", "session_id"), ("statut", "statut"),
                                 ("client", "client_id"), ("depot", "depot_id")):
            if p.get(parametre):
                qs = qs.filter(**{champ: p[parametre]})
        debut, fin = lire_date(p.get("date_debut")), lire_date(p.get("date_fin"))
        if debut:
            qs = qs.filter(date_vente__date__gte=debut)
        if fin:
            qs = qs.filter(date_vente__date__lte=fin)
        return qs

    def create(self, request):
        serializer = CreerVenteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        d = serializer.validated_data
        vente = services.creer_vente(
            utilisateur=request.user, articles=d["articles"], paiements=d["paiements"], client=d.get("client"),
            montant_recu=d.get("montant_recu"), note=d.get("note", ""),
        )
        return Response(construire_recu(vente), status=201)

    @action(detail=False, methods=["post"], url_path="apercu")
    def apercu(self, request):
        """Calcule lots, prix et total réels sans rien enregistrer."""
        from apps.caisse.models import SessionCaisse, StatutSession

        serializer = ApercuVenteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        session = SessionCaisse.objects.select_related("caisse__depot").filter(
            caissier=request.user, statut=StatutSession.OUVERTE).first()
        if session is None:
            raise ErreurMetier("Aucune session de caisse ouverte.")
        lignes, total = services.planifier_vente(serializer.validated_data["articles"], session.caisse.depot)
        return Response({
            "total": total,
            "lignes": [{"medicament": l["medicament"].pk, "medicament_nom": l["medicament"].nom,
                        "lot": l["lot"].pk, "numero_lot": l["lot"].numero_lot,
                        "date_peremption": l["lot"].date_peremption, "quantite": l["quantite"],
                        "prix_unitaire": l["prix_unitaire"], "total": l["total"]} for l in lignes],
        })

    @action(detail=True, methods=["post"], url_path="annuler")
    def annuler(self, request, pk=None):
        if request.user.role != ADMIN:
            raise ErreurMetier("Seul un administrateur peut annuler une vente.")
        self.get_object()
        serializer = AnnulerVenteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        services.annuler_vente(pk, request.user, serializer.validated_data["motif"])
        return Response(VenteSerializer(self.get_queryset().get(pk=pk)).data)


class RecuViewSet(viewsets.ReadOnlyModelViewSet):
    """Reçus clients : la liste résume les ventes, le détail fournit le reçu prêt à imprimer."""

    roles_lecture = (CAISSIER,)
    roles_ecriture = ()
    search_fields = ["reference", "client__nom"]
    ordering = ["-date_vente", "-id"]

    def get_serializer_class(self):
        return VenteListeSerializer

    def get_queryset(self):
        qs = Vente.objects.select_related("client", "caissier", "depot").prefetch_related("paiements__mode_paiement")
        if self.request.user.role == CAISSIER:
            qs = qs.filter(caissier=self.request.user)
        return qs

    def retrieve(self, request, *args, **kwargs):
        return Response(construire_recu(self.get_object()))
