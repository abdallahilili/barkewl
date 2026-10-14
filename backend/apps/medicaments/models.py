import uuid

from django.db import models
from django.utils import timezone


class Categorie(models.Model):
    nom = models.CharField(max_length=100, unique=True)
    description = models.CharField(max_length=255, blank=True)

    class Meta:
        db_table = "categories"
        ordering = ["nom"]

    def __str__(self):
        return self.nom


class Medicament(models.Model):
    nom = models.CharField(max_length=200, db_index=True)
    nom_generique = models.CharField(max_length=200, blank=True)
    code = models.CharField(max_length=40, unique=True, blank=True)
    code_barre = models.CharField(max_length=64, unique=True, null=True, blank=True)
    categorie = models.ForeignKey(Categorie, null=True, blank=True, on_delete=models.PROTECT, related_name="medicaments")
    forme = models.CharField(max_length=60, blank=True)
    dosage = models.CharField(max_length=60, blank=True)
    unite = models.CharField(max_length=60, blank=True)
    laboratoire = models.CharField(max_length=120, blank=True)
    emplacement = models.CharField(max_length=60, blank=True, help_text="Emplacement en rayon (ex. Rayon A3)")
    prix_achat = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    prix_vente = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    stock_minimum = models.PositiveIntegerField(default=0)
    frequence_vente = models.PositiveIntegerField(
        default=0, help_text="Quantité totale vendue (cumulée à chaque vente, utilisée pour le classement des médicaments les plus vendus)."
    )
    actif = models.BooleanField(default=True)
    date_creation = models.DateTimeField(auto_now_add=True)
    date_modification = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "medicaments"
        ordering = ["nom"]

    def __str__(self):
        return f"{self.nom} {self.dosage}".strip()

    def save(self, *args, **kwargs):
        if not self.code:
            self.code = "TMP-" + uuid.uuid4().hex[:12]
        super().save(*args, **kwargs)
        if self.code.startswith("TMP-"):
            self.code = f"MED-{self.pk:06d}"
            super().save(update_fields=["code"])


class Lot(models.Model):
    medicament = models.ForeignKey(Medicament, on_delete=models.PROTECT, related_name="lots")
    numero_lot = models.CharField(max_length=60)
    date_fabrication = models.DateField(null=True, blank=True)
    date_peremption = models.DateField(db_index=True)
    prix_achat = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    # Prix de vente propre au lot ; s'il est vide, on utilise celui du médicament.
    prix_vente = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    quantite_initiale = models.PositiveIntegerField(default=0)
    date_creation = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "lots"
        ordering = ["date_peremption", "id"]
        constraints = [models.UniqueConstraint(fields=["medicament", "numero_lot"], name="unique_lot_par_medicament")]

    def __str__(self):
        return f"{self.medicament.nom} — lot {self.numero_lot}"

    @property
    def prix_vente_effectif(self):
        return self.prix_vente if self.prix_vente is not None else self.medicament.prix_vente

    @property
    def est_perime(self):
        return self.date_peremption < timezone.localdate()
