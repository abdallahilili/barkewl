from decimal import Decimal

from django.db.models import Q, Sum
from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from apps.commun.constantes import ADMIN, CAISSIER, ROLES_APPROBATEURS
from apps.commun.exceptions import ErreurMetier
from apps.commun.utilitaires import lire_date
from apps.commun.vues_base import ViewSetGestion
from apps.licence import offres
from apps.utilisateurs.approbation import verifier_approbation
from apps.medicaments.conditionnement import libelle

from . import services
from .models import Client, PaiementVente, RetourVente, StatutVente, Vente
from .serializers import (
    AnnulerVenteSerializer, ApercuVenteSerializer, ClientSerializer, CreerRetourSerializer, CreerVenteSerializer,
    RetourListeSerializer, RetourSerializer, VenteListeSerializer, VenteSerializer, construire_recu,
)


def exiger_approbation(utilisateur, donnees, phrase):
    """Propriétaire et pharmacien : pas d'approbation. Vendeur : l'approbation sur place (identifiant + PIN du
    propriétaire ou du pharmacien) est obligatoire ; renvoie l'approbateur (None si l'utilisateur en est un)."""
    if utilisateur.role in ROLES_APPROBATEURS:
        return None
    offres.exiger_fonction("approbation")      # offre Essentiel : seul le propriétaire peut le faire
    if not donnees.get("approbateur_identifiant") or not donnees.get("approbateur_pin"):
        raise ErreurMetier(f"{phrase} par le propriétaire ou le pharmacien (identifiant et code PIN).")
    return verifier_approbation(donnees["approbateur_identifiant"], donnees["approbateur_pin"])


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
    roles_par_action = {"apercu": (CAISSIER,), "annuler": (CAISSIER,)}
    search_fields = ["reference", "client__nom", "client__telephone"]
    ordering_fields = ["date_vente", "reference", "total", "statut"]
    ordering = ["-date_vente", "-id"]

    def get_serializer_class(self):
        return VenteListeSerializer if self.action == "list" else VenteSerializer

    def get_queryset(self):
        qs = (
            Vente.objects.select_related("client", "caissier", "depot", "annule_par")
            .prefetch_related("paiements__mode_paiement", "lignes__medicament", "lignes__lot", "lignes__retours")
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
        if p.get("mode_paiement"):
            # Ventes réglées (au moins en partie) avec ce mode de paiement : espèces, Bankily, Masrvi…
            qs = qs.filter(paiements__mode_paiement_id=p["mode_paiement"]).distinct()
        return qs

    def get_serializer_context(self):
        contexte = super().get_serializer_context()
        if self.action == "list" and self.request.query_params.get("mode_paiement"):
            contexte["mode_paiement"] = self.request.query_params["mode_paiement"]
        return contexte

    def list(self, request, *args, **kwargs):
        """Liste paginée + `montant_total` : somme des ventes validées de TOUTES les pages du résultat filtré
        (les ventes annulées restent listées mais ne comptent pas). Filtré par mode de paiement, c'est la somme
        des montants réglés avec ce mode ; sinon la somme des totaux de vente."""
        reponse = super().list(request, *args, **kwargs)
        ventes = self.filter_queryset(self.get_queryset()).filter(statut=StatutVente.VALIDEE).order_by().values("pk")
        mode = request.query_params.get("mode_paiement")
        if mode:
            somme = PaiementVente.objects.filter(vente__in=ventes, mode_paiement_id=mode).aggregate(s=Sum("montant"))["s"]
        else:
            somme = Vente.objects.filter(pk__in=ventes).aggregate(s=Sum("total"))["s"]
        reponse.data["montant_total"] = somme or Decimal("0")
        return reponse

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
                        "conditionnement": l["conditionnement"],
                        "conditionnement_libelle": libelle(l["medicament"], l["conditionnement"], l["quantite"]),
                        "prix_unitaire": l["prix_unitaire"], "total": l["total"]} for l in lignes],
        })

    @action(detail=True, methods=["post"], url_path="annuler")
    def annuler(self, request, pk=None):
        """Propriétaire et pharmacien : annulation directe. Vendeur : approbation sur place (PIN) obligatoire."""
        self.get_object()
        serializer = AnnulerVenteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        d = serializer.validated_data
        approbateur = exiger_approbation(request.user, d, "L'annulation doit être approuvée")
        services.annuler_vente(pk, request.user, d["motif"], approbateur=approbateur)
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


class RetourVenteViewSet(viewsets.ReadOnlyModelViewSet):
    """Retours clients : liste, détail et création d'un retour partiel (jamais de modification ni de suppression)."""

    roles_lecture = (CAISSIER,)
    roles_ecriture = (CAISSIER,)
    search_fields = ["reference", "vente__reference", "vente__client__nom", "motif"]
    ordering_fields = ["date_retour", "reference", "total"]
    ordering = ["-date_retour", "-id"]

    def get_serializer_class(self):
        return RetourListeSerializer if self.action == "list" else RetourSerializer

    def get_queryset(self):
        qs = (RetourVente.objects.select_related("vente__client", "utilisateur", "approuve_par", "mode_paiement")
              .prefetch_related("lignes__ligne_vente__medicament", "lignes__ligne_vente__lot"))
        if self.request.user.role == CAISSIER:
            qs = qs.filter(Q(vente__caissier=self.request.user) | Q(utilisateur=self.request.user))
        p = self.request.query_params
        if p.get("vente"):
            qs = qs.filter(vente_id=p["vente"])
        debut, fin = lire_date(p.get("date_debut")), lire_date(p.get("date_fin"))
        if debut:
            qs = qs.filter(date_retour__date__gte=debut)
        if fin:
            qs = qs.filter(date_retour__date__lte=fin)
        return qs

    def list(self, request, *args, **kwargs):
        reponse = super().list(request, *args, **kwargs)
        somme = self.filter_queryset(self.get_queryset()).order_by().aggregate(s=Sum("total"))["s"]
        reponse.data["montant_total"] = somme or Decimal("0")
        return reponse

    def create(self, request):
        serializer = CreerRetourSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        d = serializer.validated_data
        vente = d["vente"]
        # Un vendeur ne peut retourner que ses propres ventes (comme il ne voit que celles-là).
        if request.user.role == CAISSIER and vente.caissier_id != request.user.pk:
            raise ErreurMetier("Vous ne pouvez retourner que les ventes que vous avez faites.")
        approbateur = exiger_approbation(request.user, d, "Le retour doit être approuvé")
        retour = services.retourner_articles(
            vente_id=vente.pk, utilisateur=request.user, motif=d["motif"], mode_paiement=d.get("mode_paiement"),
            lignes=[{"ligne_vente": a["ligne_vente"], "quantite": a["quantite"], "etat": a["etat"]} for a in d["articles"]],
            approbateur=approbateur,
        )
        return Response(RetourSerializer(self.get_queryset().get(pk=retour.pk)).data, status=201)
