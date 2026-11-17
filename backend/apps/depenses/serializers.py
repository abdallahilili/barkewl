from decimal import Decimal

from rest_framework import serializers

from apps.caisse.models import ModePaiement

from .models import CategorieDepense, Depense


class DepenseSerializer(serializers.ModelSerializer):
    categorie_libelle = serializers.CharField(source="get_categorie_display", read_only=True)
    utilisateur_nom = serializers.CharField(source="utilisateur.nom_complet", read_only=True)
    annule_par_nom = serializers.CharField(source="annule_par.nom_complet", read_only=True, default=None)
    mode_paiement_nom = serializers.CharField(source="mode_paiement.nom", read_only=True, default=None)

    class Meta:
        model = Depense
        fields = [
            "id", "reference", "categorie", "categorie_libelle", "libelle", "montant", "date_depense",
            "payee_depuis_caisse", "mode_paiement", "mode_paiement_nom", "note", "utilisateur_nom", "date_creation",
            "statut", "date_annulation", "annule_par_nom", "motif_annulation",
        ]


class CreerDepenseSerializer(serializers.Serializer):
    categorie = serializers.ChoiceField(choices=CategorieDepense.choices)
    libelle = serializers.CharField(max_length=200)
    montant = serializers.DecimalField(max_digits=14, decimal_places=2, min_value=Decimal("0.01"))
    date_depense = serializers.DateField(required=False)
    payee_depuis_caisse = serializers.BooleanField(default=False)
    mode_paiement = serializers.PrimaryKeyRelatedField(queryset=ModePaiement.objects.filter(actif=True), required=False, allow_null=True)
    note = serializers.CharField(required=False, allow_blank=True, max_length=255)


class AnnulerDepenseSerializer(serializers.Serializer):
    motif = serializers.CharField(max_length=255)
