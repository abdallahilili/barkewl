from collections import OrderedDict
from decimal import Decimal

from rest_framework import serializers

from apps.caisse.models import ModePaiement
from apps.commun.parametres import identite_documents, mise_en_page_recu
from apps.medicaments.conditionnement import BOITE, CONDITIONNEMENTS, libelle
from apps.medicaments.models import Medicament

from .models import Client, EtatRetour, LigneRetourVente, LigneVente, PaiementVente, RetourVente, Vente


class ClientSerializer(serializers.ModelSerializer):
    class Meta:
        model = Client
        fields = ["id", "nom", "telephone", "adresse", "notes", "actif", "date_creation"]
        read_only_fields = ["date_creation"]


class LigneVenteSerializer(serializers.ModelSerializer):
    medicament_nom = serializers.CharField(source="medicament.nom", read_only=True)
    numero_lot = serializers.CharField(source="lot.numero_lot", read_only=True)
    date_peremption = serializers.DateField(source="lot.date_peremption", read_only=True)
    conditionnement_libelle = serializers.SerializerMethodField()
    deja_retourne = serializers.SerializerMethodField()
    retournable = serializers.SerializerMethodField()

    class Meta:
        model = LigneVente
        fields = ["id", "medicament", "medicament_nom", "lot", "numero_lot", "date_peremption", "conditionnement",
                  "conditionnement_libelle", "quantite", "prix_unitaire", "total", "deja_retourne", "retournable"]

    def get_conditionnement_libelle(self, obj):
        return libelle(obj.medicament, obj.conditionnement, obj.quantite)

    def get_deja_retourne(self, obj):
        return sum(r.quantite for r in obj.retours.all())

    def get_retournable(self, obj):
        return obj.quantite - self.get_deja_retourne(obj)


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
    montant_mode = serializers.SerializerMethodField()

    class Meta:
        model = Vente
        fields = [
            "id", "reference", "date_vente", "client", "client_nom", "caissier_nom", "depot_nom", "session",
            "total", "statut", "modes_paiement", "montant_mode",
        ]

    def get_modes_paiement(self, obj):
        return ", ".join(p.mode_paiement.nom for p in obj.paiements.all())

    def get_montant_mode(self, obj):
        """Montant réglé avec le mode de paiement filtré (?mode_paiement=) ; absent quand la liste n'est pas filtrée par mode."""
        mode = self.context.get("mode_paiement")
        if not mode:
            return None
        return sum((p.montant for p in obj.paiements.all() if str(p.mode_paiement_id) == str(mode)), Decimal("0"))


class VenteSerializer(VenteListeSerializer):
    lignes = LigneVenteSerializer(many=True, read_only=True)
    paiements = PaiementVenteSerializer(many=True, read_only=True)
    annule_par_nom = serializers.CharField(source="annule_par.nom_complet", read_only=True, default=None)
    annulation_approuvee_par_nom = serializers.CharField(source="annulation_approuvee_par.nom_complet", read_only=True, default=None)

    class Meta(VenteListeSerializer.Meta):
        fields = VenteListeSerializer.Meta.fields + [
            "montant_recu", "note", "date_annulation", "annule_par_nom", "annulation_approuvee_par_nom", "motif_annulation", "lignes", "paiements",
        ]


class ArticleVenteSerializer(serializers.Serializer):
    medicament = serializers.PrimaryKeyRelatedField(queryset=Medicament.objects.all())
    conditionnement = serializers.ChoiceField(choices=CONDITIONNEMENTS, default=BOITE)
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
    # Approbation sur place (vendeur) : identifiant et code PIN du propriétaire ou du pharmacien.
    approbateur_identifiant = serializers.CharField(required=False, allow_blank=True, max_length=50)
    approbateur_pin = serializers.CharField(required=False, allow_blank=True, max_length=6)


class LigneRetourSerializer(serializers.ModelSerializer):
    medicament_nom = serializers.CharField(source="ligne_vente.medicament.nom", read_only=True)
    numero_lot = serializers.CharField(source="ligne_vente.lot.numero_lot", read_only=True)
    conditionnement = serializers.CharField(source="ligne_vente.conditionnement", read_only=True)
    conditionnement_libelle = serializers.SerializerMethodField()

    class Meta:
        model = LigneRetourVente
        fields = ["id", "ligne_vente", "medicament_nom", "numero_lot", "conditionnement", "conditionnement_libelle",
                  "quantite", "etat", "montant"]

    def get_conditionnement_libelle(self, obj):
        return libelle(obj.ligne_vente.medicament, obj.ligne_vente.conditionnement, obj.quantite)


class RetourListeSerializer(serializers.ModelSerializer):
    vente_reference = serializers.CharField(source="vente.reference", read_only=True)
    client_nom = serializers.CharField(source="vente.client.nom", read_only=True, default=None)
    utilisateur_nom = serializers.CharField(source="utilisateur.nom_complet", read_only=True)
    approuve_par_nom = serializers.CharField(source="approuve_par.nom_complet", read_only=True, default=None)
    mode_paiement_nom = serializers.CharField(source="mode_paiement.nom", read_only=True)

    class Meta:
        model = RetourVente
        fields = ["id", "reference", "date_retour", "vente", "vente_reference", "client_nom", "utilisateur_nom",
                  "approuve_par_nom", "mode_paiement_nom", "motif", "total"]


class RetourSerializer(RetourListeSerializer):
    lignes = LigneRetourSerializer(many=True, read_only=True)

    class Meta(RetourListeSerializer.Meta):
        fields = RetourListeSerializer.Meta.fields + ["lignes"]


class ArticleRetourSerializer(serializers.Serializer):
    ligne_vente = serializers.PrimaryKeyRelatedField(queryset=LigneVente.objects.all())
    quantite = serializers.IntegerField(min_value=1)
    etat = serializers.ChoiceField(choices=EtatRetour.choices)


class CreerRetourSerializer(serializers.Serializer):
    vente = serializers.PrimaryKeyRelatedField(queryset=Vente.objects.all())
    motif = serializers.CharField(max_length=255)
    articles = ArticleRetourSerializer(many=True, allow_empty=False)
    mode_paiement = serializers.PrimaryKeyRelatedField(queryset=ModePaiement.objects.all(), required=False, allow_null=True)
    # Approbation sur place (vendeur) : identifiant et code PIN du propriétaire ou du pharmacien.
    approbateur_identifiant = serializers.CharField(required=False, allow_blank=True, max_length=50)
    approbateur_pin = serializers.CharField(required=False, allow_blank=True, max_length=6)


def construire_recu(vente):
    """Données du reçu client (impression navigateur côté frontend)."""
    regroupees = OrderedDict()
    medicaments = {}
    for ligne in vente.lignes.select_related("medicament"):
        cle = (ligne.medicament_id, ligne.conditionnement, ligne.prix_unitaire)
        medicaments[ligne.medicament_id] = ligne.medicament
        if cle not in regroupees:
            regroupees[cle] = {"medicament": ligne.medicament.nom, "dosage": ligne.medicament.dosage,
                               "conditionnement": ligne.conditionnement, "quantite": 0,
                               "prix_unitaire": ligne.prix_unitaire, "total": Decimal("0")}
        regroupees[cle]["quantite"] += ligne.quantite
        regroupees[cle]["total"] += ligne.total
    for (medicament_id, conditionnement, _), ligne in regroupees.items():
        # Libellé seulement pour le détail : une vente à la boîte s'affiche comme avant.
        ligne["conditionnement_libelle"] = (
            libelle(medicaments[medicament_id], conditionnement, ligne["quantite"]) if conditionnement != BOITE else ""
        )
    paiements = list(vente.paiements.select_related("mode_paiement"))
    especes = sum((p.montant for p in paiements if p.mode_paiement.type == "ESPECES"), Decimal("0"))
    rendu = (vente.montant_recu - especes) if vente.montant_recu is not None else None
    return {
        "id": vente.pk,
        "reference": vente.reference,
        "date_vente": vente.date_vente,
        "statut": vente.statut,
        "pharmacie": identite_documents(),
        "mise_en_page": mise_en_page_recu(),
        "client": vente.client.nom if vente.client else None,
        "caissier": vente.caissier.nom_complet,
        "depot": vente.depot.nom,
        "lignes": list(regroupees.values()),
        "total": vente.total,
        "paiements": [{"mode_paiement": p.mode_paiement.nom, "montant": p.montant} for p in paiements],
        "montant_recu": vente.montant_recu,
        "rendu": rendu if rendu and rendu > 0 else None,
    }
