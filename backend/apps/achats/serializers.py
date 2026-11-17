from decimal import Decimal
from django.db import transaction
from rest_framework import serializers

from apps.commun.constantes import StatutDocument
from apps.commun.exceptions import ErreurMetier
from apps.commun.parametres import identite_documents
from apps.commun.references import prochaine_reference
from apps.caisse.models import ModePaiement

from .models import Achat, BonCommande, LigneAchat, LigneBonCommande, StatutBonCommande


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


class LigneBonCommandeSerializer(serializers.ModelSerializer):
    medicament_nom = serializers.CharField(source="medicament.nom", read_only=True)
    medicament_dosage = serializers.CharField(source="medicament.dosage", read_only=True)
    medicament_code = serializers.CharField(source="medicament.code", read_only=True)
    quantite = serializers.IntegerField(min_value=1)
    prix_achat = serializers.DecimalField(max_digits=12, decimal_places=2, min_value=0, required=False)

    class Meta:
        model = LigneBonCommande
        fields = [
            "id", "medicament", "medicament_nom", "medicament_dosage", "medicament_code",
            "designation", "quantite", "prix_achat", "total",
        ]
        read_only_fields = ["total"]


class BonCommandeListeSerializer(serializers.ModelSerializer):
    fournisseur_nom = serializers.CharField(source="fournisseur.nom", read_only=True)
    depot_nom = serializers.CharField(source="depot.nom", read_only=True)
    utilisateur_nom = serializers.CharField(source="utilisateur.nom_complet", read_only=True)
    statut_libelle = serializers.CharField(source="get_statut_display", read_only=True)

    class Meta:
        model = BonCommande
        fields = [
            "id", "reference", "fournisseur", "fournisseur_nom", "depot", "depot_nom", "date_commande",
            "date_livraison_prevue", "statut", "statut_libelle", "total", "utilisateur_nom",
        ]


class BonCommandeSerializer(BonCommandeListeSerializer):
    lignes = LigneBonCommandeSerializer(many=True)
    fournisseur_telephone = serializers.CharField(source="fournisseur.telephone", read_only=True)
    fournisseur_adresse = serializers.CharField(source="fournisseur.adresse", read_only=True)
    fournisseur_email = serializers.CharField(source="fournisseur.email", read_only=True)
    pharmacie = serializers.SerializerMethodField()

    class Meta(BonCommandeListeSerializer.Meta):
        fields = BonCommandeListeSerializer.Meta.fields + [
            "note", "lignes", "fournisseur_telephone", "fournisseur_adresse", "fournisseur_email", "pharmacie",
        ]
        read_only_fields = ["reference", "statut", "total"]

    def get_pharmacie(self, bon):
        return identite_documents()

    def validate_lignes(self, lignes):
        if not lignes:
            raise serializers.ValidationError("Ajoutez au moins une ligne.")
        ids = [ligne["medicament"].pk for ligne in lignes]
        if len(set(ids)) != len(ids):
            raise serializers.ValidationError("Un même médicament ne peut apparaître que sur une seule ligne : regroupez les quantités.")
        return lignes

    def validate_fournisseur(self, fournisseur):
        if not fournisseur.actif:
            raise serializers.ValidationError("Ce fournisseur est désactivé.")
        return fournisseur

    def validate_depot(self, depot):
        if not depot.actif:
            raise serializers.ValidationError("Ce dépôt est désactivé.")
        return depot

    def _ecrire_lignes(self, bon, lignes):
        for ligne in lignes:
            medicament = ligne["medicament"]
            prix = ligne.get("prix_achat")
            if prix is None:
                prix = medicament.prix_achat or Decimal("0")
            LigneBonCommande.objects.create(
                bon=bon, medicament=medicament, designation=medicament.nom, quantite=ligne["quantite"], prix_achat=prix,
            )
        bon.recalculer_total()

    def create(self, donnees):
        lignes = donnees.pop("lignes")
        with transaction.atomic():
            bon = BonCommande.objects.create(
                reference=prochaine_reference("BC"), utilisateur=self.context["request"].user, **donnees
            )
            self._ecrire_lignes(bon, lignes)
        return bon

    def update(self, instance, donnees):
        if instance.statut != StatutBonCommande.BROUILLON:
            raise ErreurMetier("Seul un bon de commande en brouillon peut être modifié.")
        lignes = donnees.pop("lignes", None)
        with transaction.atomic():
            for champ, valeur in donnees.items():
                setattr(instance, champ, valeur)
            instance.save()
            if lignes is not None:
                instance.lignes.all().delete()
                self._ecrire_lignes(instance, lignes)
        return instance
