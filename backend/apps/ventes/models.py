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
    motif_annulation = models.CharField(max_length=255, blank=True)

    class Meta:
        db_table = "ventes"
        ordering = ["-date_vente", "-id"]


class LigneVente(models.Model):
    vente = models.ForeignKey(Vente, on_delete=models.CASCADE, related_name="lignes")
    medicament = models.ForeignKey("medicaments.Medicament", on_delete=models.PROTECT, related_name="+")
    lot = models.ForeignKey("medicaments.Lot", on_delete=models.PROTECT, related_name="+")
    quantite = models.PositiveIntegerField()
    prix_unitaire = models.DecimalField(max_digits=12, decimal_places=2)
    total = models.DecimalField(max_digits=14, decimal_places=2)

    class Meta:
        db_table = "lignes_vente"


class PaiementVente(models.Model):
    vente = models.ForeignKey(Vente, on_delete=models.CASCADE, related_name="paiements")
    mode_paiement = models.ForeignKey("caisse.ModePaiement", on_delete=models.PROTECT, related_name="+")
    montant = models.DecimalField(max_digits=14, decimal_places=2)
    reference_transaction = models.CharField(max_length=80, blank=True)

    class Meta:
        db_table = "paiements_vente"
