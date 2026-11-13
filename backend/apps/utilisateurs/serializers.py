from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError as ErreurValidationDjango
from rest_framework import serializers

from apps.commun.constantes import ADMIN, MODULES_PAR_ROLE, ROLES_APPROBATEURS
from apps.licence import offres

from .models import Utilisateur


def verifier_robustesse(mot_de_passe, utilisateur=None):
    """Règles AUTH_PASSWORD_VALIDATORS ; renvoie la liste des problèmes (vide si le mot de passe convient)."""
    try:
        validate_password(mot_de_passe, utilisateur)
    except ErreurValidationDjango as erreur:
        return list(erreur.messages)
    return []


class UtilisateurSerializer(serializers.ModelSerializer):
    mot_de_passe = serializers.CharField(write_only=True, required=False, min_length=8, style={"input_type": "password"})
    nom_complet = serializers.CharField(read_only=True)
    modules = serializers.SerializerMethodField()
    pin_defini = serializers.SerializerMethodField()

    class Meta:
        model = Utilisateur
        fields = [
            "id", "identifiant", "nom", "prenom", "nom_complet", "email", "telephone",
            "role", "actif", "date_creation", "mot_de_passe", "modules", "pin_defini",
        ]
        read_only_fields = ["date_creation"]

    def get_modules(self, obj):
        return offres.modules_autorises(MODULES_PAR_ROLE.get(obj.role, []))

    def get_pin_defini(self, obj):
        return obj.role in ROLES_APPROBATEURS and bool(obj.code_pin)

    def validate(self, donnees):
        if self.instance is None and not donnees.get("mot_de_passe"):
            raise serializers.ValidationError({"mot_de_passe": "Le mot de passe est obligatoire."})
        if self.instance is None:
            candidat = Utilisateur(**{c: donnees.get(c, "") for c in ("identifiant", "nom", "prenom", "email")})
            problemes = verifier_robustesse(donnees["mot_de_passe"], candidat)
            if problemes:
                raise serializers.ValidationError({"mot_de_passe": problemes})
        requete = self.context.get("request")
        if self.instance and requete and self.instance.pk == requete.user.pk:
            if donnees.get("actif") is False or donnees.get("role", ADMIN) != ADMIN and self.instance.role == ADMIN:
                raise serializers.ValidationError("Vous ne pouvez pas désactiver votre compte ni retirer votre rôle de propriétaire.")

        # Limites de l'offre (licence) : rôles disponibles et nombre de comptes actifs.
        offre = offres.definition()
        role = donnees.get("role", self.instance.role if self.instance else None)
        role_change = self.instance is None or role != self.instance.role
        if role_change and role not in offre["roles"]:
            libelle = dict(Utilisateur._meta.get_field("role").choices).get(role, role)
            raise serializers.ValidationError({"role": offres.message_hors_offre(f"le rôle « {libelle} »")})
        devient_actif = donnees.get("actif", True) and (self.instance is None or not self.instance.actif)
        if devient_actif and offre["max_utilisateurs"] is not None:
            actifs = Utilisateur.objects.filter(actif=True).count()
            if actifs >= offre["max_utilisateurs"]:
                raise serializers.ValidationError(offres.message_hors_offre(
                    f"plus de {offre['max_utilisateurs']} comptes actifs"))
        return donnees

    def create(self, donnees):
        mot_de_passe = donnees.pop("mot_de_passe")
        return Utilisateur.objects.creer_utilisateur(mot_de_passe=mot_de_passe, **donnees)

    def update(self, instance, donnees):
        donnees.pop("mot_de_passe", None)
        if donnees.get("role", instance.role) not in ROLES_APPROBATEURS:
            instance.code_pin = ""          # un vendeur ou un magasinier n'approuve rien
        return super().update(instance, donnees)


class ConnexionSerializer(serializers.Serializer):
    identifiant = serializers.CharField()
    mot_de_passe = serializers.CharField(style={"input_type": "password"})


class ChangerMotDePasseSerializer(serializers.Serializer):
    ancien_mot_de_passe = serializers.CharField()
    nouveau_mot_de_passe = serializers.CharField(min_length=8)


class CodePinSerializer(serializers.Serializer):
    code_pin = serializers.RegexField(r"^\d{4,6}$", error_messages={"invalid": "Le code PIN doit contenir 4 à 6 chiffres."})
