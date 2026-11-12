from rest_framework import serializers
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from . import services


class LicenceView(APIView):
    """État de la licence : lisible sans connexion (la page de connexion affiche l'avertissement)."""

    permission_classes = [AllowAny]

    def get(self, request):
        etat = dict(services.etat_licence())
        if not (request.user and request.user.is_authenticated):
            # Sans connexion : pas de détail commercial, seulement de quoi afficher l'alerte et le code du PC.
            etat = {cle: etat[cle] for cle in ("statut", "lecture_seule", "message", "empreinte", "editeur", "jours_restants")}
        return Response(etat)


class ActiverLicenceSerializer(serializers.Serializer):
    cle = serializers.CharField(max_length=4000)


class ActiverLicenceView(APIView):
    """Activation / renouvellement : l'administrateur colle la clé reçue de Rawafid Digital Services."""

    roles_ecriture = ()

    def post(self, request):
        serializer = ActiverLicenceSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        return Response(services.activer_licence(serializer.validated_data["cle"], request.user))
