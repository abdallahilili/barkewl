from decimal import Decimal

from django.db import transaction
from rest_framework import serializers

from apps.caisse.models import ModePaiement
from apps.commun.constantes import CAISSIER
from apps.commun.exceptions import ErreurMetier
from apps.commun.parametres import identite_documents_vente
from apps.commun.references import prochaine_reference

from .models import DocumentVente, EtapeDocument, LigneDocumentVente, PaiementFacture

DEUX_DECIMALES = Decimal("0.01")


class LigneDocumentVenteSerializer(serializers.ModelSerializer):
    medicament_nom = serializers.CharField(source="medicament.nom", read_only=True)
    medicament_prix_achat = serializers.DecimalField(source="medicament.prix_achat", max_digits=12, decimal_places=2, read_only=True)
    unite = serializers.CharField(source="medicament.unite", read_only=True)
    quantite_devis = serializers.IntegerField(min_value=1)
    prix_unitaire = serializers.DecimalField(max_digits=12, decimal_places=2, min_value=0, required=False)

    class Meta:
        model = LigneDocumentVente
        fields = [
            "id", "medicament", "medicament_nom", "medicament_prix_achat", "unite",
            "designation", "quantite_devis", "quantite_livree", "prix_unitaire", "total",
        ]
        read_only_fields = ["quantite_livree", "total"]

    def to_representation(self, instance):
        donnees = super().to_representation(instance)
        requete = self.context.get("request")
        if requete and getattr(requete.user, "role", None) == CAISSIER:
            donnees.pop("medicament_prix_achat", None)
        return donnees


class PaiementFactureSerializer(serializers.ModelSerializer):
    mode_paiement_nom = serializers.CharField(source="mode_paiement.nom", read_only=True)
    utilisateur_nom = serializers.CharField(source="utilisateur.nom_complet", read_only=True)

    class Meta:
        model = PaiementFacture
        fields = ["id", "montant", "mode_paiement", "mode_paiement_nom", "utilisateur_nom", "date_paiement"]


class DocumentVenteListeSerializer(serializers.ModelSerializer):
    client_nom = serializers.CharField(source="client.nom", read_only=True)
    client_telephone = serializers.CharField(source="client.telephone", read_only=True)
    client_adresse = serializers.CharField(source="client.adresse", read_only=True)
    depot_nom = serializers.CharField(source="depot.nom", read_only=True)
    personnel_nom = serializers.CharField(source="personnel.nom_complet", read_only=True)
    etape_libelle = serializers.CharField(source="get_etape_display", read_only=True)
    reste_a_payer = serializers.DecimalField(max_digits=14, decimal_places=2, read_only=True)

    class Meta:
        model = DocumentVente
        fields = [
            "id", "reference", "client", "client_nom", "client_telephone", "client_adresse",
            "depot", "depot_nom", "personnel", "personnel_nom", "etape", "etape_libelle", "annule",
            "numero_bl", "numero_facture", "date_devis", "date_bl", "date_facture",
            "total", "montant_paye", "reste_a_payer",
        ]


class DocumentVenteSerializer(DocumentVenteListeSerializer):
    lignes = LigneDocumentVenteSerializer(many=True)
    paiements = PaiementFactureSerializer(many=True, read_only=True)
    pharmacie = serializers.SerializerMethodField()

    class Meta(DocumentVenteListeSerializer.Meta):
        fields = DocumentVenteListeSerializer.Meta.fields + ["note", "lignes", "paiements", "pharmacie"]
        read_only_fields = [
            "reference", "personnel", "etape", "annule", "numero_bl", "numero_facture",
            "date_bl", "date_facture", "total", "montant_paye",
        ]

    def get_pharmacie(self, document):
        return identite_documents_vente()

    def validate_lignes(self, lignes):
        if not lignes:
            raise serializers.ValidationError("Ajoutez au moins une ligne.")
        return lignes

    def validate_client(self, client):
        if not client.actif:
            raise serializers.ValidationError("Ce client est désactivé.")
        return client

    def validate_depot(self, depot):
        if not depot.actif:
            raise serializers.ValidationError("Ce dépôt est désactivé.")
        return depot

    def _ecrire_lignes(self, document, lignes):
        for ligne in lignes:
            medicament = ligne["medicament"]
            prix = ligne.get("prix_unitaire")
            if prix is None:
                prix = medicament.prix_vente
            quantite = ligne["quantite_devis"]
            LigneDocumentVente.objects.create(
                document=document, medicament=medicament, designation=medicament.nom,
                quantite_devis=quantite, prix_unitaire=prix, total=(prix * quantite).quantize(DEUX_DECIMALES),
            )
        document.recalculer_total()

    def create(self, donnees):
        lignes = donnees.pop("lignes")
        with transaction.atomic():
            document = DocumentVente.objects.create(
                reference=prochaine_reference("DEV"), personnel=self.context["request"].user, **donnees
            )
            self._ecrire_lignes(document, lignes)
        return document

    def update(self, instance, donnees):
        if instance.annule:
            raise ErreurMetier("Ce devis est annulé.")
        if instance.etape != EtapeDocument.DEVIS:
            raise ErreurMetier("Seul un devis peut être modifié.")
        lignes = donnees.pop("lignes", None)
        with transaction.atomic():
            for champ, valeur in donnees.items():
                setattr(instance, champ, valeur)
            instance.save()
            if lignes is not None:
                instance.lignes.all().delete()
                self._ecrire_lignes(instance, lignes)
        return instance


class LigneBLSerializer(serializers.Serializer):
    ligne = serializers.IntegerField()
    quantite_livree = serializers.IntegerField(min_value=0)


class ValiderBLSerializer(serializers.Serializer):
    lignes = LigneBLSerializer(many=True, required=False)


class PayerDocumentSerializer(serializers.Serializer):
    montant = serializers.DecimalField(max_digits=14, decimal_places=2, min_value=Decimal("0.01"))
    mode_paiement = serializers.PrimaryKeyRelatedField(queryset=ModePaiement.objects.filter(actif=True))
