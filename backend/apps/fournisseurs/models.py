from django.conf import settings
from django.db import models
from django.utils import timezone


class Fournisseur(models.Model):
    nom = models.CharField(max_length=150, unique=True)
    telephone = models.CharField(max_length=30, blank=True)
    adresse = models.CharField(max_length=255, blank=True)
    email = models.EmailField(blank=True)
    identifiant_fiscal = models.CharField(max_length=60, blank=True)
    notes = models.TextField(blank=True)
    actif = models.BooleanField(default=True)
    date_creation = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "fournisseurs"
        ordering = ["nom"]

    def __str__(self):
        return self.nom


class PaiementFournisseur(models.Model):
    achat = models.ForeignKey("achats.Achat", on_delete=models.PROTECT, related_name="paiements")
    fournisseur = models.ForeignKey(Fournisseur, on_delete=models.PROTECT, related_name="paiements")
    montant = models.DecimalField(max_digits=14, decimal_places=2)
    date_paiement = models.DateTimeField(default=timezone.now)
    mode_paiement = models.ForeignKey("caisse.ModePaiement", null=True, blank=True, on_delete=models.PROTECT, related_name="+")
    reference = models.CharField(max_length=80, blank=True)
    note = models.CharField(max_length=255, blank=True)
    utilisateur = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="+")

    class Meta:
        db_table = "paiements_fournisseur"
        ordering = ["-date_paiement", "-id"]
