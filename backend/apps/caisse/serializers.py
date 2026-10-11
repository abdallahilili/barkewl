from decimal import Decimal
from rest_framework import serializers

from .models import Caisse, ModePaiement, MouvementCaisse, SessionCaisse, TypeMouvementCaisse
from .services import calculer_resume


class ModePaiementSerializer(serializers.ModelSerializer):
    class Meta:
        model = ModePaiement
        fields = ["id", "nom", "type", "actif"]


class CaisseSerializer(serializers.ModelSerializer):
    depot_nom = serializers.CharField(source="depot.nom", read_only=True)

    class Meta:
        model = Caisse
        fields = ["id", "nom", "depot", "depot_nom", "active"]


class SessionCaisseSerializer(serializers.ModelSerializer):
    caissier_nom = serializers.CharField(source="caissier.nom_complet", read_only=True)
    caisse_nom = serializers.CharField(source="caisse.nom", read_only=True)
    depot = serializers.IntegerField(source="caisse.depot_id", read_only=True)
    depot_nom = serializers.CharField(source="caisse.depot.nom", read_only=True)
    resume = serializers.SerializerMethodField()

    class Meta:
        model = SessionCaisse
        fields = [
            "id", "caissier", "caissier_nom", "caisse", "caisse_nom", "depot", "depot_nom", "date_ouverture",
            "date_fermeture", "montant_initial", "total_ventes", "total_especes", "total_autres_paiements",
            "montant_attendu", "montant_reel", "ecart", "statut", "note", "resume",
        ]

    def get_resume(self, obj):
        return calculer_resume(obj)


class OuvrirSessionSerializer(serializers.Serializer):
    caisse = serializers.PrimaryKeyRelatedField(queryset=Caisse.objects.filter(active=True))
    montant_initial = serializers.DecimalField(max_digits=14, decimal_places=2, min_value=0, default=0)


class FermerSessionSerializer(serializers.Serializer):
    montant_reel = serializers.DecimalField(max_digits=14, decimal_places=2, min_value=0)
    note = serializers.CharField(required=False, allow_blank=True, max_length=255)


class MouvementCaisseSerializer(serializers.ModelSerializer):
    mode_paiement_nom = serializers.CharField(source="mode_paiement.nom", read_only=True)
    utilisateur_nom = serializers.CharField(source="utilisateur.nom_complet", read_only=True)
    vente_reference = serializers.CharField(source="vente.reference", read_only=True, default=None)
    type_libelle = serializers.CharField(source="get_type_mouvement_display", read_only=True)

    class Meta:
        model = MouvementCaisse
        fields = [
            "id", "session", "type_mouvement", "type_libelle", "mode_paiement", "mode_paiement_nom", "montant",
            "date_mouvement", "motif", "vente", "vente_reference", "utilisateur_nom",
        ]


class MouvementManuelSerializer(serializers.Serializer):
    type_mouvement = serializers.ChoiceField(
        choices=[TypeMouvementCaisse.ENTREE_MANUELLE, TypeMouvementCaisse.SORTIE_MANUELLE]
    )
    montant = serializers.DecimalField(max_digits=14, decimal_places=2, min_value=Decimal("0.01"))
    motif = serializers.CharField(max_length=255)
