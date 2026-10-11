from rest_framework import serializers

from apps.commun.constantes import ADMIN, MODULES_PAR_ROLE

from .models import Utilisateur


class UtilisateurSerializer(serializers.ModelSerializer):
    mot_de_passe = serializers.CharField(write_only=True, required=False, min_length=8, style={"input_type": "password"})
    nom_complet = serializers.CharField(read_only=True)
    modules = serializers.SerializerMethodField()

    class Meta:
        model = Utilisateur
        fields = [
            "id", "identifiant", "nom", "prenom", "nom_complet", "email", "telephone",
            "role", "actif", "date_creation", "mot_de_passe", "modules",
        ]
        read_only_fields = ["date_creation"]

    def get_modules(self, obj):
        return MODULES_PAR_ROLE.get(obj.role, [])

    def validate(self, donnees):
        if self.instance is None and not donnees.get("mot_de_passe"):
            raise serializers.ValidationError({"mot_de_passe": "Le mot de passe est obligatoire."})
        requete = self.context.get("request")
        if self.instance and requete and self.instance.pk == requete.user.pk:
            if donnees.get("actif") is False or donnees.get("role", ADMIN) != ADMIN and self.instance.role == ADMIN:
                raise serializers.ValidationError("Vous ne pouvez pas désactiver votre compte ni retirer votre rôle d'administrateur.")
        return donnees

    def create(self, donnees):
        mot_de_passe = donnees.pop("mot_de_passe")
        return Utilisateur.objects.creer_utilisateur(mot_de_passe=mot_de_passe, **donnees)

    def update(self, instance, donnees):
        donnees.pop("mot_de_passe", None)
        return super().update(instance, donnees)


class ConnexionSerializer(serializers.Serializer):
    identifiant = serializers.CharField()
    mot_de_passe = serializers.CharField(style={"input_type": "password"})


class ChangerMotDePasseSerializer(serializers.Serializer):
    ancien_mot_de_passe = serializers.CharField()
    nouveau_mot_de_passe = serializers.CharField(min_length=8)
