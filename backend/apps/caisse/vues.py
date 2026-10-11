from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from apps.commun.constantes import ADMIN, CAISSIER, TOUS_LES_ROLES
from apps.commun.exceptions import ErreurMetier
from apps.commun.utilitaires import lire_date
from apps.commun.vues_base import ViewSetGestion

from . import services
from .models import Caisse, ModePaiement, SessionCaisse, StatutSession
from .serializers import (
    CaisseSerializer, FermerSessionSerializer, ModePaiementSerializer, MouvementCaisseSerializer,
    MouvementManuelSerializer, OuvrirSessionSerializer, SessionCaisseSerializer,
)


class ModePaiementViewSet(ViewSetGestion):
    queryset = ModePaiement.objects.all()
    serializer_class = ModePaiementSerializer
    roles_lecture = TOUS_LES_ROLES
    roles_ecriture = ()
    search_fields = ["nom"]


class CaisseViewSet(ViewSetGestion):
    queryset = Caisse.objects.select_related("depot")
    serializer_class = CaisseSerializer
    roles_lecture = TOUS_LES_ROLES
    roles_ecriture = ()
    search_fields = ["nom", "depot__nom"]


class SessionCaisseViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = SessionCaisseSerializer
    roles_lecture = (CAISSIER,)
    roles_ecriture = (CAISSIER,)
    search_fields = ["caissier__nom", "caissier__prenom", "caisse__nom"]
    ordering_fields = ["date_ouverture", "date_fermeture", "montant_attendu", "ecart", "statut"]
    ordering = ["-date_ouverture", "-id"]

    def get_queryset(self):
        qs = SessionCaisse.objects.select_related("caissier", "caisse__depot")
        utilisateur = self.request.user
        if utilisateur.role == CAISSIER:
            qs = qs.filter(caissier=utilisateur)
        p = self.request.query_params
        for parametre, champ in (("caissier", "caissier_id"), ("caisse", "caisse_id"), ("statut", "statut")):
            if p.get(parametre):
                qs = qs.filter(**{champ: p[parametre]})
        debut, fin = lire_date(p.get("date_debut")), lire_date(p.get("date_fin"))
        if debut:
            qs = qs.filter(date_ouverture__date__gte=debut)
        if fin:
            qs = qs.filter(date_ouverture__date__lte=fin)
        return qs

    def create(self, request):
        """Ouvre une session de caisse pour l'utilisateur connecté."""
        serializer = OuvrirSessionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        session = services.ouvrir_session(
            utilisateur=request.user, caisse_id=serializer.validated_data["caisse"].pk,
            montant_initial=serializer.validated_data["montant_initial"],
        )
        return Response(self.get_serializer(session).data, status=201)

    @action(detail=False, methods=["get"], url_path="actuelle")
    def actuelle(self, request):
        session = self.get_queryset().filter(caissier=request.user, statut=StatutSession.OUVERTE).first()
        return Response({"session": self.get_serializer(session).data if session else None})

    @action(detail=True, methods=["post"], url_path="fermer")
    def fermer(self, request, pk=None):
        self.get_object()
        serializer = FermerSessionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        session = services.fermer_session(
            pk, request.user, serializer.validated_data["montant_reel"], serializer.validated_data.get("note", "")
        )
        return Response(self.get_serializer(session).data)

    @action(detail=True, methods=["get", "post"], url_path="mouvements")
    def mouvements(self, request, pk=None):
        session = self.get_object()
        if request.method == "POST":
            if session.caissier_id != request.user.pk and request.user.role != ADMIN:
                raise ErreurMetier("Vous ne pouvez pas modifier la caisse d'un autre caissier.")
            serializer = MouvementManuelSerializer(data=request.data)
            serializer.is_valid(raise_exception=True)
            d = serializer.validated_data
            mouvement = services.ajouter_mouvement_manuel(
                session_id=session.pk, utilisateur=request.user, type_mouvement=d["type_mouvement"],
                montant=d["montant"], motif=d["motif"],
            )
            return Response(MouvementCaisseSerializer(mouvement).data, status=201)
        qs = session.mouvements.select_related("mode_paiement", "utilisateur", "vente")
        return Response(MouvementCaisseSerializer(qs, many=True).data)
