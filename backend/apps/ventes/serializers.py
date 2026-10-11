from collections import OrderedDict
from decimal import Decimal

from rest_framework import serializers

from apps.caisse.models import ModePaiement
from apps.commun.parametres import obtenir_parametre
from apps.medicaments.models import Medicament

from .models import Client, LigneVente, PaiementVente, Vente


class ClientSerializer(serializers.ModelSerializer):
    class Meta:
        model = Client
        fields = ["id", "nom", "telephone", "adresse", "notes", "actif", "date_creation"]
        read_only_fields = ["date_creation"]


class LigneVenteSerializer(serializers.ModelSerializer):
    medicament_nom = serializers.CharField(source="medicament.nom", read_only=True)
    numero_lot = serializers.CharField(source="lot.numero_lot", read_only=True)
    date_peremption = serializers.DateField(source="lot.date_peremption", read_only=True)

    class Meta:
        model = LigneVente
        fields = ["id", "medicament", "medicament_nom", "lot", "numero_lot", "date_peremption", "quantite", "prix_unitaire", "total"]


class PaiementVenteSerializer(serializers.ModelSerializer):
    mode_paiement_nom = serializers.CharField(source="mode_paiement.nom", read_only=True)

    class Meta:
        model = PaiementVente
        fields = ["id", "mode_paiement", "mode_paiement_nom", "montant", "reference_transaction"]


class VenteListeSerializer(serializers.ModelSerializer):
    client_nom = serializers.CharField(source="client.nom", read_only=True, default=None)
    caissier_nom = serializers.CharField(source="caissier.nom_complet", read_only=True)
    depot_nom = serializers.CharField(source="depot.nom", read_only=True)
    modes_paiement = serializers.SerializerMethodField()

    class Meta:
        model = Vente
        fields = [
            "id", "reference", "date_vente", "client", "client_nom", "caissier_nom", "depot_nom", "session",
            "total", "statut", "modes_paiement",
        ]

    def get_modes_paiement(self, obj):
        return ", ".join(p.mode_paiement.nom for p in obj.paiements.all())


class VenteSerializer(VenteListeSerializer):
    lignes = LigneVenteSerializer(many=True, read_only=True)
    paiements = PaiementVenteSerializer(many=True, read_only=True)
    annule_par_nom = serializers.CharField(source="annule_par.nom_complet", read_only=True, default=None)

    class Meta(VenteListeSerializer.Meta):
        fields = VenteListeSerializer.Meta.fields + [
            "montant_recu", "note", "date_annulation", "annule_par_nom", "motif_annulation", "lignes", "paiements",
        ]


class ArticleVenteSerializer(serializers.Serializer):
    medicament = serializers.PrimaryKeyRelatedField(queryset=Medicament.objects.all())
    quantite = serializers.IntegerField(min_value=1)


class PaiementEntreeSerializer(serializers.Serializer):
    mode_paiement = serializers.PrimaryKeyRelatedField(queryset=ModePaiement.objects.filter(actif=True))
    montant = serializers.DecimalField(max_digits=14, decimal_places=2, min_value=Decimal("0.01"))
    reference_transaction = serializers.CharField(required=False, allow_blank=True, max_length=80)


class CreerVenteSerializer(serializers.Serializer):
    client = serializers.PrimaryKeyRelatedField(queryset=Client.objects.filter(actif=True), required=False, allow_null=True)
    articles = ArticleVenteSerializer(many=True, allow_empty=False)
    paiements = PaiementEntreeSerializer(many=True, allow_empty=False)
    montant_recu = serializers.DecimalField(max_digits=14, decimal_places=2, required=False, allow_null=True, min_value=0)
    note = serializers.CharField(required=False, allow_blank=True, max_length=255)


class ApercuVenteSerializer(serializers.Serializer):
    articles = ArticleVenteSerializer(many=True, allow_empty=False)


class AnnulerVenteSerializer(serializers.Serializer):
    motif = serializers.CharField(max_length=255)


def construire_recu(vente):
    """Données du reçu client (impression navigateur côté frontend)."""
    regroupees = OrderedDict()
    for ligne in vente.lignes.select_related("medicament"):
        cle = (ligne.medicament_id, ligne.prix_unitaire)
        if cle not in regroupees:
            regroupees[cle] = {"medicament": ligne.medicament.nom, "dosage": ligne.medicament.dosage,
                               "quantite": 0, "prix_unitaire": ligne.prix_unitaire, "total": Decimal("0")}
        regroupees[cle]["quantite"] += ligne.quantite
        regroupees[cle]["total"] += ligne.total
    paiements = list(vente.paiements.select_related("mode_paiement"))
    especes = sum((p.montant for p in paiements if p.mode_paiement.type == "ESPECES"), Decimal("0"))
    rendu = (vente.montant_recu - especes) if vente.montant_recu is not None else None
    return {
        "id": vente.pk,
        "reference": vente.reference,
        "date_vente": vente.date_vente,
        "statut": vente.statut,
        "pharmacie": {
            "nom": obtenir_parametre("nom_pharmacie"), "adresse": obtenir_parametre("adresse_pharmacie"),
            "telephone": obtenir_parametre("telephone_pharmacie"),
            "telephone_2": obtenir_parametre("telephone_pharmacie_2"),
            "telephone_3": obtenir_parametre("telephone_pharmacie_3"),
            "devise": obtenir_parametre("devise"),
            "message": obtenir_parametre("message_recu"), "logo": obtenir_parametre("logo_pharmacie"),
        },
        "client": vente.client.nom if vente.client else None,
        "caissier": vente.caissier.nom_complet,
        "depot": vente.depot.nom,
        "lignes": list(regroupees.values()),
        "total": vente.total,
        "paiements": [{"mode_paiement": p.mode_paiement.nom, "montant": p.montant} for p in paiements],
        "montant_recu": vente.montant_recu,
        "rendu": rendu if rendu and rendu > 0 else None,
    }
