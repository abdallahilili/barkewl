from django.utils import timezone
from rest_framework import serializers

from apps.commun.constantes import StatutDocument
from apps.commun.references import prochaine_reference
from apps.commun.serializers import MasquerPrixAchatMixin
from apps.commun.parametres import obtenir_entier
from apps.depots.models import Depot
from apps.medicaments.models import Lot, Medicament

from .models import Inventaire, LigneInventaire, LigneTransfert, MouvementStock, Stock, Transfert


class StockSerializer(MasquerPrixAchatMixin, serializers.ModelSerializer):
    medicament_id = serializers.IntegerField(source="lot.medicament_id", read_only=True)
    medicament = serializers.CharField(source="lot.medicament.nom", read_only=True)
    dosage = serializers.CharField(source="lot.medicament.dosage", read_only=True)
    forme = serializers.CharField(source="lot.medicament.forme", read_only=True)
    categorie = serializers.CharField(source="lot.medicament.categorie.nom", read_only=True, default=None)
    numero_lot = serializers.CharField(source="lot.numero_lot", read_only=True)
    depot_nom = serializers.CharField(source="depot.nom", read_only=True)
    prix_achat = serializers.DecimalField(source="lot.prix_achat", max_digits=12, decimal_places=2, read_only=True)
    prix_vente = serializers.SerializerMethodField()
    valeur_stock = serializers.SerializerMethodField()
    date_peremption = serializers.DateField(source="lot.date_peremption", read_only=True)
    jours_restants = serializers.SerializerMethodField()
    etat = serializers.SerializerMethodField()

    class Meta:
        model = Stock
        fields = [
            "id", "medicament_id", "medicament", "dosage", "forme", "categorie", "lot", "numero_lot",
            "depot", "depot_nom", "quantite", "prix_achat", "prix_vente", "valeur_stock",
            "date_peremption", "jours_restants", "etat",
        ]

    def get_prix_vente(self, obj):
        return obj.lot.prix_vente_effectif

    def get_valeur_stock(self, obj):
        return obj.quantite * obj.lot.prix_achat

    def get_jours_restants(self, obj):
        return (obj.lot.date_peremption - timezone.localdate()).days

    def get_etat(self, obj):
        jours = (obj.lot.date_peremption - timezone.localdate()).days
        if obj.quantite <= 0:
            return "RUPTURE" if getattr(obj, "total_medicament_depot", 0) <= 0 else "EPUISE"
        if jours < 0:
            return "PERIME"
        seuil = self.context.setdefault("_seuil_peremption", obtenir_entier("jours_alerte_peremption"))
        if jours <= seuil:
            return "BIENTOT_PERIME"
        minimum = obj.lot.medicament.stock_minimum
        total = getattr(obj, "total_medicament_depot", obj.quantite)
        if minimum > 0 and total <= minimum:
            return "STOCK_FAIBLE"
        return "DISPONIBLE"


class MouvementStockSerializer(serializers.ModelSerializer):
    utilisateur_nom = serializers.CharField(source="utilisateur.nom_complet", read_only=True)
    medicament_nom = serializers.CharField(source="medicament.nom", read_only=True)
    numero_lot = serializers.CharField(source="lot.numero_lot", read_only=True)
    depot_nom = serializers.CharField(source="depot.nom", read_only=True)
    type_libelle = serializers.CharField(source="get_type_mouvement_display", read_only=True)

    class Meta:
        model = MouvementStock
        fields = [
            "id", "date_mouvement", "utilisateur", "utilisateur_nom", "medicament", "medicament_nom",
            "lot", "numero_lot", "depot", "depot_nom", "type_mouvement", "type_libelle", "quantite",
            "stock_avant", "stock_apres", "motif", "reference",
        ]


class EntreeStockSerializer(serializers.Serializer):
    medicament = serializers.PrimaryKeyRelatedField(queryset=Medicament.objects.filter(actif=True))
    numero_lot = serializers.CharField(max_length=60)
    date_fabrication = serializers.DateField(required=False, allow_null=True)
    date_peremption = serializers.DateField()
    depot = serializers.PrimaryKeyRelatedField(queryset=Depot.objects.filter(actif=True))
    quantite = serializers.IntegerField(min_value=1)
    prix_achat = serializers.DecimalField(max_digits=12, decimal_places=2, required=False, allow_null=True, min_value=0)
    prix_vente = serializers.DecimalField(max_digits=12, decimal_places=2, required=False, allow_null=True, min_value=0)
    motif = serializers.ChoiceField(choices=["RETOUR_CLIENT", "CORRECTION", "AUTRE"])
    note = serializers.CharField(required=False, allow_blank=True, max_length=200)

    def validate_date_peremption(self, valeur):
        if valeur < timezone.localdate():
            raise serializers.ValidationError("Ce lot est déjà périmé : l'entrée en stock est refusée.")
        return valeur


class SortieStockSerializer(serializers.Serializer):
    lot = serializers.PrimaryKeyRelatedField(queryset=Lot.objects.select_related("medicament"))
    depot = serializers.PrimaryKeyRelatedField(queryset=Depot.objects.all())
    quantite = serializers.IntegerField(min_value=1)
    motif = serializers.ChoiceField(
        choices=["PEREMPTION", "ENDOMMAGE", "PERTE", "CONSOMMATION_INTERNE", "CORRECTION", "AUTRE"]
    )
    note = serializers.CharField(required=False, allow_blank=True, max_length=200)


# ---------------------------------------------------------------- Transferts

class LigneTransfertSerializer(serializers.ModelSerializer):
    medicament_nom = serializers.CharField(source="lot.medicament.nom", read_only=True)
    numero_lot = serializers.CharField(source="lot.numero_lot", read_only=True)
    date_peremption = serializers.DateField(source="lot.date_peremption", read_only=True)
    quantite = serializers.IntegerField(min_value=1)

    class Meta:
        model = LigneTransfert
        fields = ["id", "lot", "medicament_nom", "numero_lot", "date_peremption", "quantite"]


class TransfertSerializer(serializers.ModelSerializer):
    lignes = LigneTransfertSerializer(many=True)
    depot_source_nom = serializers.CharField(source="depot_source.nom", read_only=True)
    depot_destination_nom = serializers.CharField(source="depot_destination.nom", read_only=True)
    utilisateur_nom = serializers.CharField(source="utilisateur.nom_complet", read_only=True)

    class Meta:
        model = Transfert
        fields = [
            "id", "reference", "date_transfert", "utilisateur_nom", "depot_source", "depot_source_nom",
            "depot_destination", "depot_destination_nom", "statut", "note", "date_validation", "lignes",
        ]
        read_only_fields = ["reference", "date_transfert", "statut", "date_validation"]

    def validate(self, donnees):
        source = donnees.get("depot_source", getattr(self.instance, "depot_source", None))
        destination = donnees.get("depot_destination", getattr(self.instance, "depot_destination", None))
        if source == destination:
            raise serializers.ValidationError("Le dépôt source et le dépôt destination doivent être différents.")
        if "lignes" in donnees:
            if not donnees["lignes"]:
                raise serializers.ValidationError({"lignes": "Ajoutez au moins une ligne."})
            lots = [l["lot"].pk for l in donnees["lignes"]]
            if len(lots) != len(set(lots)):
                raise serializers.ValidationError({"lignes": "Un lot ne peut apparaître qu'une seule fois."})
        return donnees

    def create(self, donnees):
        from django.db import transaction

        lignes = donnees.pop("lignes")
        with transaction.atomic():
            transfert = Transfert.objects.create(
                reference=prochaine_reference("TRF"), utilisateur=self.context["request"].user, **donnees
            )
            LigneTransfert.objects.bulk_create([LigneTransfert(transfert=transfert, **l) for l in lignes])
        return transfert

    def update(self, instance, donnees):
        from django.db import transaction
        from apps.commun.exceptions import ErreurMetier

        if instance.statut != StatutDocument.BROUILLON:
            raise ErreurMetier("Seul un transfert en brouillon peut être modifié.")
        lignes = donnees.pop("lignes", None)
        with transaction.atomic():
            for champ, valeur in donnees.items():
                setattr(instance, champ, valeur)
            instance.save()
            if lignes is not None:
                instance.lignes.all().delete()
                LigneTransfert.objects.bulk_create([LigneTransfert(transfert=instance, **l) for l in lignes])
        return instance


# --------------------------------------------------------------- Inventaires

class LigneInventaireSerializer(serializers.ModelSerializer):
    medicament_nom = serializers.CharField(source="lot.medicament.nom", read_only=True)
    numero_lot = serializers.CharField(source="lot.numero_lot", read_only=True)
    date_peremption = serializers.DateField(source="lot.date_peremption", read_only=True)
    ecart = serializers.IntegerField(read_only=True)

    class Meta:
        model = LigneInventaire
        fields = [
            "id", "lot", "medicament_nom", "numero_lot", "date_peremption",
            "quantite_theorique", "quantite_physique", "ecart", "ecart_applique",
        ]


class InventaireSerializer(serializers.ModelSerializer):
    depot_nom = serializers.CharField(source="depot.nom", read_only=True)
    utilisateur_nom = serializers.CharField(source="utilisateur.nom_complet", read_only=True)
    nombre_lignes = serializers.SerializerMethodField()
    nombre_ecarts = serializers.SerializerMethodField()

    class Meta:
        model = Inventaire
        fields = [
            "id", "reference", "depot", "depot_nom", "date_creation", "utilisateur_nom", "statut",
            "note", "date_validation", "nombre_lignes", "nombre_ecarts",
        ]
        read_only_fields = ["reference", "date_creation", "statut", "date_validation"]

    def get_nombre_lignes(self, obj):
        return obj.lignes.count()

    def get_nombre_ecarts(self, obj):
        return sum(1 for l in obj.lignes.all() if l.ecart not in (None, 0))


class InventaireDetailSerializer(InventaireSerializer):
    lignes = LigneInventaireSerializer(many=True, read_only=True)

    class Meta(InventaireSerializer.Meta):
        fields = InventaireSerializer.Meta.fields + ["lignes"]


class SaisieInventaireSerializer(serializers.Serializer):
    lignes = serializers.ListField(
        child=serializers.DictField(), allow_empty=False
    )

    def validate_lignes(self, valeur):
        propres = []
        for element in valeur:
            try:
                identifiant = int(element["id"])
                quantite = element.get("quantite_physique")
                quantite = None if quantite in (None, "") else int(quantite)
            except (KeyError, TypeError, ValueError):
                raise serializers.ValidationError("Chaque ligne doit contenir « id » et « quantite_physique » (entier).")
            if quantite is not None and quantite < 0:
                raise serializers.ValidationError("Une quantité physique ne peut pas être négative.")
            propres.append((identifiant, quantite))
        return propres
