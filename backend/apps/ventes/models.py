from django.conf import settings
from django.db import models
from django.utils import timezone


class Client(models.Model):
    """Client facultatif : sert uniquement à retrouver l'historique d'achats (aucun dossier médical)."""

    nom = models.CharField(max_length=150)
    telephone = models.CharField(max_length=30, blank=True)
    adresse = models.CharField(max_length=255, blank=True)
    notes = models.TextField(blank=True)
    actif = models.BooleanField(default=True)
    date_creation = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "clients"
        ordering = ["nom"]

    def __str__(self):
        return self.nom


class StatutVente(models.TextChoices):
    VALIDEE = "VALIDEE", "Validée"
    ANNULEE = "ANNULEE", "Annulée"


class Vente(models.Model):
    """Une vente = un reçu. La référence est le numéro de reçu (REC-2026-00125)."""

    reference = models.CharField(max_length=30, unique=True)
    client = models.ForeignKey(Client, null=True, blank=True, on_delete=models.PROTECT, related_name="ventes")
    session = models.ForeignKey("caisse.SessionCaisse", on_delete=models.PROTECT, related_name="ventes")
    caissier = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="+")
    depot = models.ForeignKey("depots.Depot", on_delete=models.PROTECT, related_name="ventes")
    date_vente = models.DateTimeField(default=timezone.now, db_index=True)
    total = models.DecimalField(max_digits=14, decimal_places=2)
    montant_recu = models.DecimalField(max_digits=14, decimal_places=2, null=True, blank=True)
    note = models.CharField(max_length=255, blank=True)
    statut = models.CharField(max_length=10, choices=StatutVente.choices, default=StatutVente.VALIDEE, db_index=True)
    date_annulation = models.DateTimeField(null=True, blank=True)
    annule_par = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.PROTECT, related_name="+")
    # Propriétaire ou pharmacien qui a approuvé (code PIN) l'annulation demandée par un vendeur.
    annulation_approuvee_par = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True,
                                                 on_delete=models.PROTECT, related_name="+")
    motif_annulation = models.CharField(max_length=255, blank=True)

    class Meta:
        db_table = "ventes"
        ordering = ["-date_vente", "-id"]


class LigneVente(models.Model):
    vente = models.ForeignKey(Vente, on_delete=models.CASCADE, related_name="lignes")
    medicament = models.ForeignKey("medicaments.Medicament", on_delete=models.PROTECT, related_name="+")
    lot = models.ForeignKey("medicaments.Lot", on_delete=models.PROTECT, related_name="+")
    # quantite et prix_unitaire sont exprimés dans le conditionnement vendu (ex. 2 plaquettes à 40).
    conditionnement = models.CharField(max_length=10, default="BOITE")
    # Unités de stock par conditionnement au moment de la vente (sortie de stock = quantite × ce nombre).
    unites_par_conditionnement = models.PositiveIntegerField(default=1)
    quantite = models.PositiveIntegerField()
    prix_unitaire = models.DecimalField(max_digits=12, decimal_places=2)
    total = models.DecimalField(max_digits=14, decimal_places=2)

    class Meta:
        db_table = "lignes_vente"

    @property
    def quantite_unites(self):
        return self.quantite * self.unites_par_conditionnement


class PaiementVente(models.Model):
    vente = models.ForeignKey(Vente, on_delete=models.CASCADE, related_name="paiements")
    mode_paiement = models.ForeignKey("caisse.ModePaiement", on_delete=models.PROTECT, related_name="+")
    montant = models.DecimalField(max_digits=14, decimal_places=2)
    reference_transaction = models.CharField(max_length=80, blank=True)

    class Meta:
        db_table = "paiements_vente"


class EtatRetour(models.TextChoices):
    REVENDABLE = "REVENDABLE", "Revendable"
    NON_REVENDABLE = "NON_REVENDABLE", "Non revendable"


class RetourVente(models.Model):
    """
    Retour partiel d'une vente : un ou plusieurs articles rendus par le client. Jamais modifié ni supprimé.
    Le remboursement est enregistré en caisse (mouvement REMBOURSEMENT) dans la session de celui qui le fait.
    """

    reference = models.CharField(max_length=30, unique=True)
    vente = models.ForeignKey(Vente, on_delete=models.PROTECT, related_name="retours")
    session = models.ForeignKey("caisse.SessionCaisse", on_delete=models.PROTECT, related_name="retours_clients")
    mode_paiement = models.ForeignKey("caisse.ModePaiement", on_delete=models.PROTECT, related_name="+")
    utilisateur = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="+")
    # Propriétaire ou pharmacien qui a approuvé (code PIN) le retour demandé par un vendeur.
    approuve_par = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.PROTECT,
                                     related_name="+")
    date_retour = models.DateTimeField(default=timezone.now, db_index=True)
    motif = models.CharField(max_length=255)
    total = models.DecimalField(max_digits=14, decimal_places=2)

    class Meta:
        db_table = "retours_vente"
        ordering = ["-date_retour", "-id"]

    def __str__(self):
        return self.reference


class LigneRetourVente(models.Model):
    retour = models.ForeignKey(RetourVente, on_delete=models.CASCADE, related_name="lignes")
    ligne_vente = models.ForeignKey(LigneVente, on_delete=models.PROTECT, related_name="retours")
    # Quantité rendue, dans le conditionnement vendu (comme la ligne de vente d'origine).
    quantite = models.PositiveIntegerField()
    unites = models.PositiveIntegerField(help_text="Quantité rendue en unités de stock")
    etat = models.CharField(max_length=20, choices=EtatRetour.choices)
    montant = models.DecimalField(max_digits=14, decimal_places=2)

    class Meta:
        db_table = "lignes_retour_vente"
