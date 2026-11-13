from django.utils import timezone
from rest_framework.decorators import action
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView
from rest_framework_simplejwt.exceptions import TokenError
from rest_framework_simplejwt.tokens import RefreshToken

from apps.commun.audit import enregistrer_audit
from apps.commun.exceptions import ErreurMetier, NonAuthentifie
from apps.commun.vues_base import ViewSetGestion

from .models import Utilisateur
from apps.commun.constantes import ROLES_APPROBATEURS

from .serializers import (
    ChangerMotDePasseSerializer, CodePinSerializer, ConnexionSerializer, UtilisateurSerializer, verifier_robustesse,
)


class ConnexionView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "connexion"

    def post(self, request):
        serializer = ConnexionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        donnees = serializer.validated_data
        utilisateur = Utilisateur.objects.filter(identifiant=donnees["identifiant"]).first()
        if not utilisateur or not utilisateur.check_password(donnees["mot_de_passe"]) or not utilisateur.actif:
            raise NonAuthentifie("Identifiant ou mot de passe incorrect.")
        utilisateur.last_login = timezone.now()
        utilisateur.save(update_fields=["last_login"])
        jeton = RefreshToken.for_user(utilisateur)
        jeton["role"] = utilisateur.role
        return Response(
            {
                "acces": str(jeton.access_token),
                "rafraichissement": str(jeton),
                "utilisateur": UtilisateurSerializer(utilisateur, context={"request": request}).data,
            }
        )


class RafraichirView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []

    def post(self, request):
        try:
            jeton = RefreshToken(request.data.get("rafraichissement"))
            utilisateur = Utilisateur.objects.get(pk=jeton["user_id"])
        except (TokenError, Utilisateur.DoesNotExist, KeyError):
            raise NonAuthentifie("Session expirée. Veuillez vous reconnecter.")
        if not utilisateur.actif:
            raise NonAuthentifie("Compte désactivé.")
        acces = str(jeton.access_token)
        jeton.set_jti()
        jeton.set_exp()
        jeton.set_iat()
        return Response({"acces": acces, "rafraichissement": str(jeton)})


class MoiView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response(UtilisateurSerializer(request.user, context={"request": request}).data)


class ChangerMotDePasseView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        serializer = ChangerMotDePasseSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        if not request.user.check_password(serializer.validated_data["ancien_mot_de_passe"]):
            raise ErreurMetier("L'ancien mot de passe est incorrect.")
        problemes = verifier_robustesse(serializer.validated_data["nouveau_mot_de_passe"], request.user)
        if problemes:
            raise ErreurMetier(" ".join(problemes))
        request.user.set_password(serializer.validated_data["nouveau_mot_de_passe"])
        request.user.save(update_fields=["password"])
        enregistrer_audit(request.user, "MODIFICATION", "Utilisateur", request.user.pk, description="Changement de mot de passe")
        return Response({"detail": "Mot de passe modifié."})


class UtilisateurViewSet(ViewSetGestion):
    """Gestion des comptes (administrateur uniquement)."""

    queryset = Utilisateur.objects.all().order_by("nom", "prenom")
    serializer_class = UtilisateurSerializer
    roles_lecture = ()
    roles_ecriture = ()
    search_fields = ["identifiant", "nom", "prenom"]
    ordering_fields = ["nom", "identifiant", "role", "date_creation"]

    @action(detail=True, methods=["post"], url_path="reinitialiser-mot-de-passe")
    def reinitialiser_mot_de_passe(self, request, pk=None):
        utilisateur = self.get_object()
        mot_de_passe = request.data.get("mot_de_passe", "")
        problemes = verifier_robustesse(mot_de_passe, utilisateur)
        if problemes:
            raise ErreurMetier(" ".join(problemes))
        utilisateur.set_password(mot_de_passe)
        utilisateur.save(update_fields=["password"])
        enregistrer_audit(request.user, "MODIFICATION", "Utilisateur", utilisateur.pk, reference=str(utilisateur),
                          description="Réinitialisation du mot de passe")
        return Response({"detail": "Mot de passe réinitialisé."})

    @action(detail=True, methods=["post"], url_path="definir-pin")
    def definir_pin(self, request, pk=None):
        """Code PIN d'approbation d'un propriétaire ou d'un pharmacien (vide = supprimer)."""
        utilisateur = self.get_object()
        if utilisateur.role not in ROLES_APPROBATEURS:
            raise ErreurMetier("Seuls le propriétaire et le pharmacien ont un code PIN d'approbation.")
        code = (request.data.get("code_pin") or "").strip()
        if code:
            serializer = CodePinSerializer(data={"code_pin": code})
            serializer.is_valid(raise_exception=True)
        utilisateur.definir_code_pin(code)
        utilisateur.save(update_fields=["code_pin"])
        enregistrer_audit(request.user, "MODIFICATION", "Utilisateur", utilisateur.pk, reference=str(utilisateur),
                          description="Code PIN d'approbation " + ("défini" if code else "supprimé"))
        return Response(UtilisateurSerializer(utilisateur, context={"request": request}).data)
