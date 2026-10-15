from decimal import Decimal

from django.conf import settings
from django.db import models


class EtapeDocument(models.TextChoices):
    DEVIS = "DEVIS", "Devis"
    BON_LIVRAISON = "BON_LIVRAISON", "Bon de livraison"
    FACTURE = "FACTURE", "Facture"


class DocumentVente(models.Model):
    """Circuit Devis -> Bon de livraison -> Facture : une même ligne mute d'étape en étape.
    Le stock ne bouge qu'à la validation du BL ; le paiement n'intervient qu'au stade Facture."""

    reference = models.CharField(max_length=30, unique=True)
    client = models.ForeignKey("ventes.Client", on_delete=models.PROTECT, related_name="documents_vente")
    depot = models.ForeignKey("depots.Depot", on_delete=models.PROTECT, related_name="documents_vente")
    personnel = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="+")
    etape = models.CharField(max_length=20, choices=EtapeDocument.choices, default=EtapeDocument.DEVIS)
    annule = models.BooleanField(default=False)
    numero_bl = models.CharField(max_length=30, blank=True)
    numero_facture = models.CharField(max_length=30, blank=True)
    date_devis = models.DateTimeField(auto_now_add=True)
    date_bl = models.DateTimeField(null=True, blank=True)
    date_facture = models.DateTimeField(null=True, blank=True)
    total = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    montant_paye = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    note = models.CharField(max_length=255, blank=True)

    class Meta:
        db_table = "documents_vente"
        ordering = ["-id"]

    def __str__(self):
        return self.reference

    @property
    def reste_a_payer(self):
        return self.total - self.montant_paye

    def recalculer_total(self):
        self.total = sum((l.total for l in self.lignes.all()), Decimal("0"))
        self.save(update_fields=["total"])


class LigneDocumentVente(models.Model):
    document = models.ForeignKey(DocumentVente, on_delete=models.CASCADE, related_name="lignes")
    medicament = models.ForeignKey("medicaments.Medicament", on_delete=models.PROTECT, related_name="+")
    designation = models.CharField(max_length=200, blank=True)
    quantite_devis = models.PositiveIntegerField()
    quantite_livree = models.PositiveIntegerField(default=0)
    prix_unitaire = models.DecimalField(max_digits=12, decimal_places=2)
    total = models.DecimalField(max_digits=14, decimal_places=2, default=0)

    class Meta:
        db_table = "lignes_document_vente"
        ordering = ["id"]


class PaiementFacture(models.Model):
    document = models.ForeignKey(DocumentVente, on_delete=models.PROTECT, related_name="paiements")
    montant = models.DecimalField(max_digits=14, decimal_places=2)
    mode_paiement = models.ForeignKey("caisse.ModePaiement", on_delete=models.PROTECT, related_name="+")
    session = models.ForeignKey("caisse.SessionCaisse", on_delete=models.PROTECT, related_name="+")
    utilisateur = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="+")
    date_paiement = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "paiements_facture"
        ordering = ["-date_paiement"]
