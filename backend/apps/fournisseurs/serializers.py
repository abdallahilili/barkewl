from rest_framework import serializers

from .models import Fournisseur, PaiementFournisseur


class FournisseurSerializer(serializers.ModelSerializer):
    solde = serializers.DecimalField(max_digits=16, decimal_places=2, read_only=True)

    class Meta:
        model = Fournisseur
        fields = ["id", "nom", "telephone", "adresse", "email", "identifiant_fiscal", "notes", "actif", "solde", "date_creation"]
        read_only_fields = ["date_creation"]


class PaiementFournisseurSerializer(serializers.ModelSerializer):
    fournisseur_nom = serializers.CharField(source="fournisseur.nom", read_only=True)
    achat_reference = serializers.CharField(source="achat.reference", read_only=True)
    mode_paiement_nom = serializers.CharField(source="mode_paiement.nom", read_only=True, default=None)
    utilisateur_nom = serializers.CharField(source="utilisateur.nom_complet", read_only=True)

    class Meta:
        model = PaiementFournisseur
        fields = [
            "id", "achat", "achat_reference", "fournisseur", "fournisseur_nom", "montant", "date_paiement",
            "mode_paiement", "mode_paiement_nom", "reference", "note", "utilisateur_nom",
        ]
