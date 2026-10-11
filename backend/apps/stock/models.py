from django.conf import settings
from django.db import models
from django.utils import timezone

from apps.commun.constantes import StatutDocument
from apps.commun.modeles import ModeleImmuable


class TypeMouvement(models.TextChoices):
    ENTREE = "ENTREE", "Entrée"
    SORTIE = "SORTIE", "Sortie"
    TRANSFERT_ENTREE = "TRANSFERT_ENTREE", "Transfert (entrée)"
    TRANSFERT_SORTIE = "TRANSFERT_SORTIE", "Transfert (sortie)"
    VENTE = "VENTE", "Vente"
    RETOUR = "RETOUR", "Retour"
    INVENTAIRE = "INVENTAIRE", "Inventaire"
    PERTE = "PERTE", "Perte"
    PEREMPTION = "PEREMPTION", "Péremption"
    AJUSTEMENT = "AJUSTEMENT", "Ajustement"
    ENDOMMAGE = "ENDOMMAGE", "Produit endommagé"
    CONSOMMATION_INTERNE = "CONSOMMATION_INTERNE", "Consommation interne"


class Stock(models.Model):
    """Quantité d'un lot dans un dépôt. Ne se modifie que via services.appliquer_mouvement."""

    lot = models.ForeignKey("medicaments.Lot", on_delete=models.PROTECT, related_name="stocks")
    depot = models.ForeignKey("depots.Depot", on_delete=models.PROTECT, related_name="stocks")
    quantite = models.IntegerField(default=0)
    date_modification = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "stocks"
        constraints = [models.UniqueConstraint(fields=["lot", "depot"], name="unique_stock_lot_depot")]

    def __str__(self):
        return f"{self.lot} @ {self.depot} = {self.quantite}"


class MouvementStock(ModeleImmuable):
    """Historique du stock : jamais modifié, jamais supprimé. Quantité signée (+ entrée, - sortie)."""

    date_mouvement = models.DateTimeField(default=timezone.now, db_index=True)
    utilisateur = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="+")
    medicament = models.ForeignKey("medicaments.Medicament", on_delete=models.PROTECT, related_name="mouvements")
    lot = models.ForeignKey("medicaments.Lot", on_delete=models.PROTECT, related_name="mouvements")
    depot = models.ForeignKey("depots.Depot", on_delete=models.PROTECT, related_name="mouvements")
    type_mouvement = models.CharField(max_length=30, choices=TypeMouvement.choices, db_index=True)
    quantite = models.IntegerField()
    stock_avant = models.IntegerField()
    stock_apres = models.IntegerField()
    motif = models.CharField(max_length=255, blank=True)
    reference = models.CharField(max_length=60, blank=True, db_index=True)

    class Meta:
        db_table = "mouvements_stock"
        ordering = ["-date_mouvement", "-id"]
        indexes = [models.Index(fields=["medicament", "date_mouvement"], name="idx_mvt_med_date")]


class Transfert(models.Model):
    reference = models.CharField(max_length=30, unique=True)
    date_transfert = models.DateTimeField(default=timezone.now)
    utilisateur = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="+")
    depot_source = models.ForeignKey("depots.Depot", on_delete=models.PROTECT, related_name="transferts_sortants")
    depot_destination = models.ForeignKey("depots.Depot", on_delete=models.PROTECT, related_name="transferts_entrants")
    statut = models.CharField(max_length=10, choices=StatutDocument.choices, default=StatutDocument.BROUILLON)
    note = models.CharField(max_length=255, blank=True)
    date_validation = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "transferts"
        ordering = ["-date_transfert", "-id"]


class LigneTransfert(models.Model):
    transfert = models.ForeignKey(Transfert, on_delete=models.CASCADE, related_name="lignes")
    lot = models.ForeignKey("medicaments.Lot", on_delete=models.PROTECT, related_name="+")
    quantite = models.PositiveIntegerField()

    class Meta:
        db_table = "lignes_transfert"


class Inventaire(models.Model):
    reference = models.CharField(max_length=30, unique=True)
    depot = models.ForeignKey("depots.Depot", on_delete=models.PROTECT, related_name="inventaires")
    date_creation = models.DateTimeField(default=timezone.now)
    utilisateur = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="+")
    statut = models.CharField(max_length=10, choices=StatutDocument.choices, default=StatutDocument.BROUILLON)
    note = models.CharField(max_length=255, blank=True)
    date_validation = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "inventaires"
        ordering = ["-date_creation", "-id"]


class LigneInventaire(models.Model):
    inventaire = models.ForeignKey(Inventaire, on_delete=models.CASCADE, related_name="lignes")
    lot = models.ForeignKey("medicaments.Lot", on_delete=models.PROTECT, related_name="+")
    quantite_theorique = models.IntegerField()
    quantite_physique = models.IntegerField(null=True, blank=True)
    # Ajustement réellement appliqué à la validation (physique - stock au moment de la validation).
    ecart_applique = models.IntegerField(null=True, blank=True)

    class Meta:
        db_table = "lignes_inventaire"
        constraints = [models.UniqueConstraint(fields=["inventaire", "lot"], name="unique_ligne_inventaire_lot")]

    @property
    def ecart(self):
        if self.quantite_physique is None:
            return None
        return self.quantite_physique - self.quantite_theorique
