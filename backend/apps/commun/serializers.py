from rest_framework import serializers

from .constantes import CAISSIER


class MasquerPrixAchatMixin:
    """Le caissier ne voit pas les prix d'achat ni les valeurs de stock."""

    champs_prix_achat = ("prix_achat", "valeur_stock")

    def to_representation(self, instance):
        donnees = super().to_representation(instance)
        requete = self.context.get("request")
        if requete and getattr(requete.user, "role", None) == CAISSIER:
            for champ in self.champs_prix_achat:
                donnees.pop(champ, None)
        return donnees


class JournalAuditSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    date_action = serializers.DateTimeField()
    utilisateur = serializers.SerializerMethodField()
    action = serializers.CharField()
    entite = serializers.CharField()
    entite_id = serializers.CharField()
    reference = serializers.CharField()
    ancienne_valeur = serializers.JSONField()
    nouvelle_valeur = serializers.JSONField()
    description = serializers.CharField()

    def get_utilisateur(self, obj):
        return obj.utilisateur.nom_complet if obj.utilisateur else ""
