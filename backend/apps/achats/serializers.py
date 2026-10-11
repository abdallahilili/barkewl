from decimal import Decimal
from django.db import transaction
from rest_framework import serializers

from apps.commun.constantes import StatutDocument
from apps.commun.exceptions import ErreurMetier
from apps.commun.references import prochaine_reference
from apps.caisse.models import ModePaiement

from .models import Achat, LigneAchat


class LigneAchatSerializer(serializers.ModelSerializer):
    medicament_nom = serializers.CharField(source="medicament.nom", read_only=True)
    quantite = serializers.IntegerField(min_value=1)
    prix_achat = serializers.DecimalField(max_digits=12, decimal_places=2, min_value=0)
    prix_vente = serializers.DecimalField(max_digits=12, decimal_places=2, min_value=0, required=False, allow_null=True)

    class Meta:
        model = LigneAchat
        fields = [
            "id", "medicament", "medicament_nom", "numero_lot", "date_fabrication", "date_peremption",
            "quantite", "prix_achat", "prix_vente", "total", "lot",
        ]
        read_only_fields = ["total", "lot"]

    def validate(self, donnees):
        fab, per = donnees.get("date_fabrication"), donnees.get("date_peremption")
        if fab and per and fab >= per:
            raise serializers.ValidationError({"date_peremption": "La péremption doit suivre la fabrication."})
        return donnees


class AchatListeSerializer(serializers.ModelSerializer):
    fournisseur_nom = serializers.CharField(source="fournisseur.nom", read_only=True)
    depot_nom = serializers.CharField(source="depot.nom", read_only=True)
    utilisateur_nom = serializers.CharField(source="utilisateur.nom_complet", read_only=True)
    reste_a_payer = serializers.DecimalField(max_digits=14, decimal_places=2, read_only=True)

    class Meta:
        model = Achat
        fields = [
            "id", "reference", "fournisseur", "fournisseur_nom", "depot", "depot_nom", "date_achat",
            "reference_facture", "statut", "total", "montant_paye", "reste_a_payer", "utilisateur_nom",
        ]


class AchatSerializer(AchatListeSerializer):
    lignes = LigneAchatSerializer(many=True)

    class Meta(AchatListeSerializer.Meta):
        fields = AchatListeSerializer.Meta.fields + ["note", "date_validation", "lignes"]
        read_only_fields = ["reference", "statut", "total", "montant_paye", "date_validation"]

    def validate_lignes(self, lignes):
        if not lignes:
            raise serializers.ValidationError("Ajoutez au moins une ligne.")
        return lignes

    def validate_fournisseur(self, fournisseur):
        if not fournisseur.actif:
            raise serializers.ValidationError("Ce fournisseur est désactivé.")
        return fournisseur

    def _ecrire_lignes(self, achat, lignes):
        for ligne in lignes:
            LigneAchat.objects.create(achat=achat, **ligne)
        achat.recalculer_total()

    def create(self, donnees):
        lignes = donnees.pop("lignes")
        with transaction.atomic():
            achat = Achat.objects.create(
                reference=prochaine_reference("ACH"), utilisateur=self.context["request"].user, **donnees
            )
            self._ecrire_lignes(achat, lignes)
        return achat

    def update(self, instance, donnees):
        if instance.statut != StatutDocument.BROUILLON:
            raise ErreurMetier("Seul un achat en brouillon peut être modifié.")
        lignes = donnees.pop("lignes", None)
        with transaction.atomic():
            for champ, valeur in donnees.items():
                setattr(instance, champ, valeur)
            instance.save()
            if lignes is not None:
                instance.lignes.all().delete()
                self._ecrire_lignes(instance, lignes)
        return instance


class ValiderAchatSerializer(serializers.Serializer):
    montant_paye = serializers.DecimalField(max_digits=14, decimal_places=2, min_value=0, required=False, default=0)
    mode_paiement = serializers.PrimaryKeyRelatedField(
        queryset=ModePaiement.objects.filter(actif=True),
        required=False, allow_null=True,
    )


class PayerAchatSerializer(serializers.Serializer):
    montant = serializers.DecimalField(max_digits=14, decimal_places=2, min_value=Decimal("0.01"))
    mode_paiement = serializers.PrimaryKeyRelatedField(
        queryset=ModePaiement.objects.filter(actif=True),
        required=False, allow_null=True,
    )
    reference = serializers.CharField(required=False, allow_blank=True, max_length=80)
    note = serializers.CharField(required=False, allow_blank=True, max_length=200)
