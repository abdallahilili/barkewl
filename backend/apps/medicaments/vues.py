from datetime import timedelta

from django.db.models import Q, Sum, Value
from django.db.models.functions import Coalesce
from django.utils import timezone
from rest_framework.decorators import action
from rest_framework.response import Response

from apps.commun.constantes import ADMIN, MAGASINIER, TOUS_LES_ROLES
from apps.commun.models import JournalAudit
from apps.commun.parametres import obtenir_entier
from apps.commun.serializers import JournalAuditSerializer
from apps.commun.vues_base import ViewSetGestion

from .models import Categorie, Lot, Medicament
from .serializers import CategorieSerializer, LotSerializer, MedicamentSerializer


class CategorieViewSet(ViewSetGestion):
    queryset = Categorie.objects.all()
    serializer_class = CategorieSerializer
    roles_lecture = TOUS_LES_ROLES
    roles_ecriture = ()
    search_fields = ["nom"]


class MedicamentViewSet(ViewSetGestion):
    serializer_class = MedicamentSerializer
    roles_lecture = TOUS_LES_ROLES
    roles_ecriture = ()
    roles_par_action = {"historique": (MAGASINIER,)}
    search_fields = ["nom", "nom_generique", "code", "code_barre"]
    ordering_fields = ["nom", "code", "prix_vente", "prix_achat", "stock_total", "date_creation"]
    ordering = ["nom"]

    def get_queryset(self):
        qs = Medicament.objects.select_related("categorie").annotate(
            stock_total=Coalesce(Sum("lots__stocks__quantite"), Value(0))
        )
        p = self.request.query_params
        if p.get("actif") in ("0", "1"):
            qs = qs.filter(actif=(p["actif"] == "1"))
        if p.get("categorie"):
            qs = qs.filter(categorie_id=p["categorie"])
        return qs

    @action(detail=True, methods=["post"], url_path="basculer-actif")
    def basculer_actif(self, request, pk=None):
        medicament = self.get_object()
        ancien = medicament.actif
        medicament.actif = not ancien
        medicament.save(update_fields=["actif", "date_modification"])
        from apps.commun.audit import enregistrer_audit

        enregistrer_audit(request.user, "MODIFICATION", "Medicament", medicament.pk, reference=str(medicament),
                          ancienne={"actif": ancien}, nouvelle={"actif": medicament.actif})
        return Response({"id": medicament.pk, "actif": medicament.actif})

    @action(detail=True, methods=["get"], url_path="historique")
    def historique(self, request, pk=None):
        from apps.stock.models import MouvementStock
        from apps.stock.serializers import MouvementStockSerializer

        medicament = self.get_object()
        modifications = JournalAudit.objects.filter(entite="Medicament", entite_id=str(medicament.pk)).select_related("utilisateur")[:50]
        mouvements = (
            MouvementStock.objects.filter(medicament=medicament)
            .select_related("utilisateur", "medicament", "lot", "depot")
            .order_by("-date_mouvement", "-id")[:50]
        )
        return Response(
            {
                "modifications": JournalAuditSerializer(modifications, many=True).data,
                "mouvements": MouvementStockSerializer(mouvements, many=True).data,
            }
        )

    @action(detail=False, methods=["get"], url_path="recherche-caisse")
    def recherche_caisse(self, request):
        """Recherche rapide pour la caisse : nom, nom générique, code, code-barres.
        Sans terme de recherche, renvoie les médicaments les plus vendus (frequence_vente)."""
        from apps.stock.models import Stock

        terme = request.query_params.get("q", "").strip()
        depot_id = request.query_params.get("depot")
        aujourdhui = timezone.localdate()

        if terme:
            candidats = list(
                Medicament.objects.filter(actif=True).filter(
                    Q(nom__icontains=terme) | Q(nom_generique__icontains=terme)
                    | Q(code__icontains=terme) | Q(code_barre=terme)
                )[:30]
            )
            exacts = [m for m in candidats if terme in (m.code_barre, m.code)]
            debutent = [m for m in candidats if m not in exacts and m.nom.lower().startswith(terme.lower())]
            autres = [m for m in candidats if m not in exacts and m not in debutent]
            medicaments = (exacts + debutent + autres)[:20]
        else:
            medicaments = list(
                Medicament.objects.filter(actif=True).order_by("-frequence_vente", "nom")
            )

        stocks = Stock.objects.filter(
            lot__medicament__in=medicaments, quantite__gt=0, lot__date_peremption__gte=aujourdhui
        ).select_related("lot__medicament").order_by("lot__date_peremption", "lot_id")
        if depot_id:
            stocks = stocks.filter(depot_id=depot_id)
        par_medicament = {}
        for stock in stocks:
            par_medicament.setdefault(stock.lot.medicament_id, []).append(stock)

        resultat = []
        for m in medicaments:
            lots = par_medicament.get(m.id, [])
            resultat.append(
                {
                    "id": m.id, "nom": m.nom, "nom_generique": m.nom_generique, "dosage": m.dosage,
                    "forme": m.forme, "code": m.code, "code_barre": m.code_barre,
                    "emplacement": m.emplacement,
                    "prix_vente": lots[0].lot.prix_vente_effectif if lots else m.prix_vente,
                    "stock_disponible": sum(s.quantite for s in lots),
                    "prochaine_peremption": lots[0].lot.date_peremption if lots else None,
                    "frequence_vente": m.frequence_vente,
                }
            )
        return Response(resultat)


class LotViewSet(ViewSetGestion):
    serializer_class = LotSerializer
    roles_lecture = TOUS_LES_ROLES
    roles_ecriture = (MAGASINIER,)
    search_fields = ["numero_lot", "medicament__nom", "medicament__code", "medicament__code_barre"]
    ordering_fields = ["date_peremption", "numero_lot", "medicament__nom", "quantite_actuelle", "date_creation"]
    ordering = ["date_peremption", "id"]

    def get_queryset(self):
        qs = Lot.objects.select_related("medicament").annotate(
            quantite_actuelle=Coalesce(Sum("stocks__quantite"), Value(0))
        )
        p = self.request.query_params
        aujourdhui = timezone.localdate()
        if p.get("medicament"):
            qs = qs.filter(medicament_id=p["medicament"])
        if p.get("perime") == "1":
            qs = qs.filter(date_peremption__lt=aujourdhui)
        if p.get("proche_peremption") == "1":
            limite = aujourdhui + timedelta(days=obtenir_entier("jours_alerte_peremption"))
            qs = qs.filter(date_peremption__gte=aujourdhui, date_peremption__lte=limite)
        if p.get("en_stock") == "1":
            qs = qs.filter(quantite_actuelle__gt=0)
        return qs
