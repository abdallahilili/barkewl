from rest_framework import serializers, viewsets
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from .audit import enregistrer_audit
from .constantes import TOUS_LES_ROLES
from .exceptions import ErreurMetier
from .models import JournalAudit
from .parametres import DEFAUTS, definir_parametre, obtenir_parametre
from .serializers import JournalAuditSerializer
from .vues_base import ViewSetLecture


class IdentitePharmacieView(APIView):
    """Nom et logo de la pharmacie : accessible sans authentification (page de connexion)."""

    permission_classes = [AllowAny]
    authentication_classes = []

    def get(self, request):
        return Response({"nom": obtenir_parametre("nom_pharmacie"), "logo": obtenir_parametre("logo_pharmacie")})


class ParametresView(APIView):
    """GET : tous les paramètres (tout utilisateur). PUT : mise à jour (administrateur)."""

    roles_lecture = TOUS_LES_ROLES
    roles_ecriture = ()

    def get(self, request):
        return Response(
            [{"cle": cle, "valeur": obtenir_parametre(cle), "description": description}
             for cle, (_, description) in DEFAUTS.items()]
        )

    def put(self, request):
        if not isinstance(request.data, dict):
            raise ErreurMetier("Format attendu : {\"cle\": \"valeur\", ...}.")
        inconnus = [cle for cle in request.data if cle not in DEFAUTS]
        if inconnus:
            raise ErreurMetier(f"Paramètre(s) inconnu(s) : {', '.join(inconnus)}.")
        for cle, valeur in request.data.items():
            ancienne = obtenir_parametre(cle)
            if str(valeur) != ancienne:
                if cle == "jours_alerte_peremption" and (not str(valeur).isdigit() or int(valeur) < 1):
                    raise ErreurMetier("Le nombre de jours doit être un entier positif.")
                definir_parametre(cle, valeur)
                resume = "(image)" if cle == "logo_pharmacie" else str(valeur)
                resume_ancienne = "(image)" if cle == "logo_pharmacie" and ancienne else ancienne
                enregistrer_audit(
                    request.user, "MODIFICATION", "Parametre", cle, reference=cle,
                    ancienne={"valeur": resume_ancienne}, nouvelle={"valeur": resume},
                )
        return self.get(request)


class JournalAuditViewSet(ViewSetLecture):
    """Journal d'audit (administrateur)."""

    queryset = JournalAudit.objects.select_related("utilisateur")
    serializer_class = JournalAuditSerializer
    roles_lecture = ()
    roles_ecriture = ()
    search_fields = ["entite", "reference", "description", "action"]
    ordering = ["-date_action", "-id"]

    def get_queryset(self):
        qs = super().get_queryset()
        p = self.request.query_params
        if p.get("entite"):
            qs = qs.filter(entite=p["entite"])
        if p.get("entite_id"):
            qs = qs.filter(entite_id=p["entite_id"])
        return qs
