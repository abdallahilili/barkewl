from decimal import Decimal

from django.conf import settings
from django.db import models
from django.utils import timezone

from apps.commun.constantes import StatutDocument


class Achat(models.Model):
    """Facture fournisseur. Une fois validée : lots créés/mis à jour + entrée en stock."""

    reference = models.CharField(max_length=30, unique=True)
    fournisseur = models.ForeignKey("fournisseurs.Fournisseur", on_delete=models.PROTECT, related_name="achats")
    depot = models.ForeignKey("depots.Depot", on_delete=models.PROTECT, related_name="achats")
    date_achat = models.DateField(default=timezone.localdate)
    reference_facture = models.CharField(max_length=80, blank=True)
    statut = models.CharField(max_length=10, choices=StatutDocument.choices, default=StatutDocument.BROUILLON)
    total = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    montant_paye = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    note = models.CharField(max_length=255, blank=True)
    utilisateur = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="+")
    date_creation = models.DateTimeField(auto_now_add=True)
    date_validation = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "achats"
        ordering = ["-date_achat", "-id"]

    @property
    def reste_a_payer(self):
        return self.total - self.montant_paye

    def recalculer_total(self):
        self.total = sum((l.total for l in self.lignes.all()), Decimal("0"))
        self.save(update_fields=["total"])


class LigneAchat(models.Model):
    achat = models.ForeignKey(Achat, on_delete=models.CASCADE, related_name="lignes")
    medicament = models.ForeignKey("medicaments.Medicament", on_delete=models.PROTECT, related_name="+")
    numero_lot = models.CharField(max_length=60)
    date_fabrication = models.DateField(null=True, blank=True)
    date_peremption = models.DateField()
    quantite = models.PositiveIntegerField()
    prix_achat = models.DecimalField(max_digits=12, decimal_places=2)
    prix_vente = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    total = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    # Renseigné à la validation de l'achat.
    lot = models.ForeignKey("medicaments.Lot", null=True, blank=True, on_delete=models.PROTECT, related_name="+")

    class Meta:
        db_table = "lignes_achat"

    def save(self, *args, **kwargs):
        self.total = self.quantite * self.prix_achat
        super().save(*args, **kwargs)
