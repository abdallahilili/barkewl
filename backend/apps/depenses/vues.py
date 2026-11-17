from decimal import Decimal

from django.db.models import Sum
from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from apps.commun.utilitaires import lire_date

from . import services
from .models import Depense, StatutDepense
from .serializers import AnnulerDepenseSerializer, CreerDepenseSerializer, DepenseSerializer


class DepenseViewSet(viewsets.ReadOnlyModelViewSet):
    """Dépenses (loyer, électricité, salaires…) : propriétaire uniquement. Jamais supprimées, seulement annulées."""

    serializer_class = DepenseSerializer
    roles_lecture = ()
    roles_ecriture = ()
    search_fields = ["reference", "libelle", "note"]
    ordering_fields = ["date_depense", "reference", "montant", "categorie", "statut"]
    ordering = ["-date_depense", "-id"]

    def get_queryset(self):
        qs = Depense.objects.select_related("utilisateur", "annule_par", "mode_paiement")
        p = self.request.query_params
        for parametre, champ in (("categorie", "categorie"), ("statut", "statut")):
            if p.get(parametre):
                qs = qs.filter(**{champ: p[parametre]})
        if p.get("source") in ("caisse", "autre"):
            qs = qs.filter(payee_depuis_caisse=p["source"] == "caisse")
        debut, fin = lire_date(p.get("date_debut")), lire_date(p.get("date_fin"))
        if debut:
            qs = qs.filter(date_depense__gte=debut)
        if fin:
            qs = qs.filter(date_depense__lte=fin)
        return qs

    def list(self, request, *args, **kwargs):
        """Liste paginée + `montant_total` : somme des dépenses validées (les annulées ne comptent pas)."""
        reponse = super().list(request, *args, **kwargs)
        somme = (self.filter_queryset(self.get_queryset()).filter(statut=StatutDepense.VALIDEE)
                 .order_by().aggregate(s=Sum("montant"))["s"])
        reponse.data["montant_total"] = somme or Decimal("0")
        return reponse

    def create(self, request):
        serializer = CreerDepenseSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        d = serializer.validated_data
        depense = services.creer_depense(
            utilisateur=request.user, categorie=d["categorie"], libelle=d["libelle"], montant=d["montant"],
            date_depense=d.get("date_depense"), payee_depuis_caisse=d["payee_depuis_caisse"],
            mode_paiement=d.get("mode_paiement"), note=d.get("note", ""),
        )
        return Response(DepenseSerializer(self.get_queryset().get(pk=depense.pk)).data, status=201)

    @action(detail=True, methods=["post"], url_path="annuler")
    def annuler(self, request, pk=None):
        self.get_object()
        serializer = AnnulerDepenseSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        services.annuler_depense(pk, request.user, serializer.validated_data["motif"])
        return Response(DepenseSerializer(self.get_queryset().get(pk=pk)).data)
