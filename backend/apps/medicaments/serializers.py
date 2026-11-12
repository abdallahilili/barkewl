from django.utils import timezone
from rest_framework import serializers

from apps.commun.constantes import ROLES_SANS_PRIX_ACHAT
from apps.commun.exceptions import ErreurMetier
from apps.commun.serializers import MasquerPrixAchatMixin

from .conditionnement import (
    PLAQUETTE, UNITE, decrire_quantite, detail_disponible, plaquette_disponible, prix_conditionnement,
    valider_conditionnement,
)
from .models import Categorie, Lot, Medicament
from .services import changer_unites_par_boite


class CategorieSerializer(serializers.ModelSerializer):
    class Meta:
        model = Categorie
        fields = ["id", "nom", "description"]


class MedicamentSerializer(MasquerPrixAchatMixin, serializers.ModelSerializer):
    categorie_nom = serializers.CharField(source="categorie.nom", read_only=True, default=None)
    stock_total = serializers.IntegerField(read_only=True)
    # Présent seulement si la recherche a filtré par ?depot= (voir get_queryset) ; sinon None.
    stock_depot = serializers.SerializerMethodField()
    code_barre = serializers.CharField(required=False, allow_null=True, allow_blank=True, max_length=64)
    code = serializers.CharField(required=False, allow_blank=True, max_length=40)

    class Meta:
        model = Medicament
        fields = [
            "id", "nom", "nom_generique", "code", "code_barre", "categorie", "categorie_nom",
            "forme", "dosage", "unite", "laboratoire", "emplacement", "prix_achat", "prix_vente",
            "unites_par_boite", "unites_par_plaquette", "nom_unite_detail", "prix_vente_plaquette", "prix_vente_unite",
            "prix_plaquette_effectif", "prix_unite_effectif", "stock_texte",
            "stock_minimum", "actif", "stock_total", "stock_depot", "frequence_vente", "date_creation", "date_modification",
        ]
        read_only_fields = ["frequence_vente", "date_creation", "date_modification"]

    prix_plaquette_effectif = serializers.SerializerMethodField()
    prix_unite_effectif = serializers.SerializerMethodField()
    stock_texte = serializers.SerializerMethodField()

    def get_prix_plaquette_effectif(self, obj):
        return prix_conditionnement(obj, PLAQUETTE, obj.prix_vente) if plaquette_disponible(obj) else None

    def get_prix_unite_effectif(self, obj):
        return prix_conditionnement(obj, UNITE, obj.prix_vente) if detail_disponible(obj) else None

    def get_stock_texte(self, obj):
        total = getattr(obj, "stock_total", None)
        return None if total is None else decrire_quantite(obj, total)

    def update(self, instance, donnees):
        nouveau = donnees.get("unites_par_boite", instance.unites_par_boite)
        if nouveau != instance.unites_par_boite:
            # Conversion du stock existant, puis on repart de l'objet à jour (sinon l'ancienne valeur serait réécrite).
            converti = changer_unites_par_boite(instance, nouveau, self.context["request"].user)
            instance.unites_par_boite = converti.unites_par_boite
            instance.unites_par_plaquette = converti.unites_par_plaquette
            donnees.pop("unites_par_boite")
        return super().update(instance, donnees)

    def get_stock_depot(self, instance):
        valeur = getattr(instance, "stock_depot", None)
        return valeur

    def validate_code_barre(self, valeur):
        valeur = (valeur or "").strip()
        if not valeur:
            return None
        doublon = Medicament.objects.filter(code_barre=valeur)
        if self.instance:
            doublon = doublon.exclude(pk=self.instance.pk)
        if doublon.exists():
            raise serializers.ValidationError("Ce code-barres est déjà utilisé.")
        return valeur

    def validate_code(self, valeur):
        valeur = (valeur or "").strip()
        if not valeur:
            return self.instance.code if self.instance else ""
        doublon = Medicament.objects.filter(code=valeur)
        if self.instance:
            doublon = doublon.exclude(pk=self.instance.pk)
        if doublon.exists():
            raise serializers.ValidationError("Ce code est déjà utilisé.")
        return valeur

    def validate(self, donnees):
        for champ in ("prix_achat", "prix_vente", "prix_vente_plaquette", "prix_vente_unite"):
            if donnees.get(champ) is not None and donnees[champ] < 0:
                raise serializers.ValidationError({champ: "Le prix ne peut pas être négatif."})
        n = donnees.get("unites_par_boite", self.instance.unites_par_boite if self.instance else 1)
        p = donnees.get("unites_par_plaquette", self.instance.unites_par_plaquette if self.instance else None)
        try:
            valider_conditionnement(n, p)
        except ErreurMetier as erreur:
            raise serializers.ValidationError({"unites_par_plaquette" if p else "unites_par_boite": str(erreur.detail)})
        return donnees


class LotSerializer(MasquerPrixAchatMixin, serializers.ModelSerializer):
    medicament_nom = serializers.CharField(source="medicament.nom", read_only=True)
    quantite_actuelle = serializers.IntegerField(read_only=True)
    quantite_texte = serializers.SerializerMethodField()
    unites_par_boite = serializers.IntegerField(source="medicament.unites_par_boite", read_only=True)
    jours_restants = serializers.SerializerMethodField()
    perime = serializers.SerializerMethodField()

    class Meta:
        model = Lot
        fields = [
            "id", "medicament", "medicament_nom", "numero_lot", "date_fabrication", "date_peremption",
            "prix_achat", "prix_vente", "quantite_initiale", "quantite_actuelle", "quantite_texte", "unites_par_boite",
            "jours_restants",
            "perime", "date_creation",
        ]
        read_only_fields = ["date_creation"]

    def get_jours_restants(self, obj):
        return (obj.date_peremption - timezone.localdate()).days

    def get_quantite_texte(self, obj):
        quantite = getattr(obj, "quantite_actuelle", None)
        return None if quantite is None else decrire_quantite(obj.medicament, quantite)

    def get_perime(self, obj):
        return obj.date_peremption < timezone.localdate()

    def validate(self, donnees):
        fab, per = donnees.get("date_fabrication"), donnees.get("date_peremption")
        if fab and per and fab >= per:
            raise serializers.ValidationError({"date_peremption": "La péremption doit suivre la fabrication."})
        requete = self.context.get("request")
        if requete and requete.user.role in ROLES_SANS_PRIX_ACHAT:
            # Le pharmacien corrige les dates d'un lot, jamais ses prix (réservés au propriétaire).
            for champ in ("prix_achat", "prix_vente"):
                donnees.pop(champ, None)
        return donnees
