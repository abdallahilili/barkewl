from django.http import FileResponse
from rest_framework import serializers, viewsets
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from . import sauvegarde
from .audit import enregistrer_audit
from .constantes import TOUS_LES_ROLES
from .exceptions import ErreurMetier
from .models import JournalAudit
from .parametres import DEFAUTS, PARAMETRES_IMAGE, definir_parametre, obtenir_parametre
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
                resume = "(image)" if cle in PARAMETRES_IMAGE and valeur else str(valeur)
                resume_ancienne = "(image)" if cle in PARAMETRES_IMAGE and ancienne else ancienne
                enregistrer_audit(
                    request.user, "MODIFICATION", "Parametre", cle, reference=cle,
                    ancienne={"valeur": resume_ancienne}, nouvelle={"valeur": resume},
                )
        return self.get(request)


class SauvegardesView(APIView):
    """GET : état et liste des sauvegardes. POST : sauvegarder maintenant. Administrateur uniquement."""

    roles_lecture = ()
    roles_ecriture = ()

    def get(self, request):
        return Response({**sauvegarde.etat_sauvegardes(), "fichiers": sauvegarde.lister_sauvegardes()})

    def post(self, request):
        infos = sauvegarde.creer_sauvegarde(origine="manuelle")
        enregistrer_audit(request.user, "SAUVEGARDE", "Base de données", reference=infos["nom"],
                          description=f"Sauvegarde manuelle ({infos['taille'] // 1024} Ko)")
        return Response(infos, status=201)


class TelechargerSauvegardeView(APIView):
    """Téléchargement d'une sauvegarde (pour la copier sur une clé USB). Administrateur uniquement."""

    roles_lecture = ()

    def get(self, request, nom):
        chemin = sauvegarde.chemin_sauvegarde(nom)
        enregistrer_audit(request.user, "TELECHARGEMENT", "Base de données", reference=nom, description="Téléchargement d'une sauvegarde")
        return FileResponse(open(chemin, "rb"), as_attachment=True, filename=nom, content_type="application/gzip")


class SauvegardeUsbLecteursView(APIView):
    """GET : clés USB et disques externes branchés (pour choisir celui à préparer). Administrateur uniquement."""

    roles_lecture = ()
    roles_ecriture = ()

    def get(self, request):
        return Response(sauvegarde.lecteurs_externes())


class SauvegardeUsbPreparerView(APIView):
    """POST {"racine": "E:\\\\"} : prépare le disque (dossier + marqueur) et y copie une sauvegarde. Administrateur uniquement."""

    roles_lecture = ()
    roles_ecriture = ()

    def post(self, request):
        racine = request.data.get("racine") if isinstance(request.data, dict) else None
        resultat = sauvegarde.preparer_lecteur(str(racine or ""))
        enregistrer_audit(request.user, "SAUVEGARDE", "Clé USB", reference=resultat["lecteur"]["racine"][:60],
                          description="Préparation d'un disque de sauvegarde")
        return Response(resultat)


class SauvegardeUsbCopierView(APIView):
    """POST : copie immédiate de la dernière sauvegarde sur les clés préparées et branchées. Administrateur uniquement."""

    roles_lecture = ()
    roles_ecriture = ()

    def post(self, request):
        resultats = sauvegarde.copier_vers_usb(forcer=True)
        enregistrer_audit(request.user, "SAUVEGARDE", "Clé USB",
                          reference=", ".join(r["racine"] for r in resultats)[:60] or "-",
                          description="Copie manuelle vers la clé USB")
        return Response(resultats)


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
