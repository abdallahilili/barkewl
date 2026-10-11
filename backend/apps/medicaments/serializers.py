from django.utils import timezone
from rest_framework import serializers

from apps.commun.serializers import MasquerPrixAchatMixin

from .models import Categorie, Lot, Medicament


class CategorieSerializer(serializers.ModelSerializer):
    class Meta:
        model = Categorie
        fields = ["id", "nom", "description"]


class MedicamentSerializer(MasquerPrixAchatMixin, serializers.ModelSerializer):
    categorie_nom = serializers.CharField(source="categorie.nom", read_only=True, default=None)
    stock_total = serializers.IntegerField(read_only=True)
    code_barre = serializers.CharField(required=False, allow_null=True, allow_blank=True, max_length=64)
    code = serializers.CharField(required=False, allow_blank=True, max_length=40)

    class Meta:
        model = Medicament
        fields = [
            "id", "nom", "nom_generique", "code", "code_barre", "categorie", "categorie_nom",
            "forme", "dosage", "unite", "laboratoire", "emplacement", "prix_achat", "prix_vente",
            "stock_minimum", "actif", "stock_total", "date_creation", "date_modification",
        ]
        read_only_fields = ["date_creation", "date_modification"]

    def validate_code_barre(self, valeur):
        valeur = (valeur or "").strip()
        if not valeur:
            return None
        doublon = Medicament.objects.filter(code_barre=valeur)
        if self.instance:
            doublon = doublon.exclude(pk=self.instance.pk)
        if doublon.exists():
            raise serializers.ValidationError("Ce code-barres est déjà utilisé.")
        return valeur

    def validate_code(self, valeur):
        valeur = (valeur or "").strip()
        if not valeur:
            return self.instance.code if self.instance else ""
        doublon = Medicament.objects.filter(code=valeur)
        if self.instance:
            doublon = doublon.exclude(pk=self.instance.pk)
        if doublon.exists():
            raise serializers.ValidationError("Ce code est déjà utilisé.")
        return valeur

    def validate(self, donnees):
        for champ in ("prix_achat", "prix_vente"):
            if donnees.get(champ) is not None and donnees[champ] < 0:
                raise serializers.ValidationError({champ: "Le prix ne peut pas être négatif."})
        return donnees


class LotSerializer(MasquerPrixAchatMixin, serializers.ModelSerializer):
    medicament_nom = serializers.CharField(source="medicament.nom", read_only=True)
    quantite_actuelle = serializers.IntegerField(read_only=True)
    jours_restants = serializers.SerializerMethodField()
    perime = serializers.SerializerMethodField()

    class Meta:
        model = Lot
        fields = [
            "id", "medicament", "medicament_nom", "numero_lot", "date_fabrication", "date_peremption",
            "prix_achat", "prix_vente", "quantite_initiale", "quantite_actuelle", "jours_restants",
            "perime", "date_creation",
        ]
        read_only_fields = ["date_creation"]

    def get_jours_restants(self, obj):
        return (obj.date_peremption - timezone.localdate()).days

    def get_perime(self, obj):
        return obj.date_peremption < timezone.localdate()

    def validate(self, donnees):
        fab, per = donnees.get("date_fabrication"), donnees.get("date_peremption")
        if fab and per and fab >= per:
            raise serializers.ValidationError({"date_peremption": "La péremption doit suivre la fabrication."})
        return donnees
