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
    quantite = models.PositiveIntegerField(help_text="En boîtes")
    # Unités par boîte au moment de la validation (entrée en stock = quantite × ce nombre).
    unites_par_boite = models.PositiveIntegerField(default=1)
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


class StatutBonCommande(models.TextChoices):
    BROUILLON = "BROUILLON", "Brouillon"
    ENVOYE = "ENVOYE", "Envoyé"
    RECU = "RECU", "Reçu"
    ANNULE = "ANNULE", "Annulé"


class BonCommande(models.Model):
    """Commande adressée à un fournisseur. Document purement administratif : elle ne touche ni au stock ni à la
    caisse (la réception se fait par un achat). Modifiable tant qu'elle est en brouillon."""

    reference = models.CharField(max_length=30, unique=True)
    fournisseur = models.ForeignKey("fournisseurs.Fournisseur", on_delete=models.PROTECT, related_name="bons_commande")
    depot = models.ForeignKey("depots.Depot", on_delete=models.PROTECT, related_name="bons_commande")
    date_commande = models.DateField(default=timezone.localdate)
    date_livraison_prevue = models.DateField(null=True, blank=True)
    statut = models.CharField(max_length=10, choices=StatutBonCommande.choices, default=StatutBonCommande.BROUILLON)
    total = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    note = models.CharField(max_length=255, blank=True)
    utilisateur = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="+")
    date_creation = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "bons_commande"
        ordering = ["-date_commande", "-id"]

    def __str__(self):
        return self.reference

    def recalculer_total(self):
        self.total = sum((l.total for l in self.lignes.all()), Decimal("0"))
        self.save(update_fields=["total"])


class LigneBonCommande(models.Model):
    bon = models.ForeignKey(BonCommande, on_delete=models.CASCADE, related_name="lignes")
    medicament = models.ForeignKey("medicaments.Medicament", on_delete=models.PROTECT, related_name="+")
    designation = models.CharField(max_length=200, blank=True)
    quantite = models.PositiveIntegerField(help_text="En boîtes")
    # Prix d'achat estimé (indicatif) : le prix réel est celui de la facture du fournisseur.
    prix_achat = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    total = models.DecimalField(max_digits=14, decimal_places=2, default=0)

    class Meta:
        db_table = "lignes_bon_commande"
        ordering = ["id"]

    def save(self, *args, **kwargs):
        self.total = self.quantite * self.prix_achat
        super().save(*args, **kwargs)
