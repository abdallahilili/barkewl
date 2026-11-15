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


class Forme(models.Model):
    """Référentiel des formes galéniques (comprimé, sirop, gélule…) proposées dans la fiche médicament."""
    nom = models.CharField(max_length=60, unique=True)
    actif = models.BooleanField(default=True)

    class Meta:
        db_table = "formes"
        ordering = ["nom"]

    def __str__(self):
        return self.nom


class Dosage(models.Model):
    """Référentiel des dosages (500 mg, 1 g, 125 mg/5 ml…) proposés dans la fiche médicament."""
    nom = models.CharField(max_length=60, unique=True)
    actif = models.BooleanField(default=True)

    class Meta:
        db_table = "dosages"
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
    # Prix d'achat et de vente : toujours pour une BOÎTE entière (comme sur la facture du fournisseur).
    prix_achat = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    prix_vente = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    # Conditionnement : le stock est compté dans la plus petite unité (comprimé, gélule, sachet…).
    # 1 = vendu uniquement à la boîte (comportement d'origine).
    unites_par_boite = models.PositiveIntegerField(default=1, help_text="Nombre d'unités (comprimés…) dans une boîte")
    unites_par_plaquette = models.PositiveIntegerField(
        null=True, blank=True, help_text="Nombre d'unités dans une plaquette ; vide = pas de vente à la plaquette")
    nom_unite_detail = models.CharField(max_length=30, blank=True, help_text="Ex. comprimé, gélule, sachet")
    prix_vente_plaquette = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True,
                                               help_text="Vide = calculé à partir du prix de la boîte")
    prix_vente_unite = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True,
                                           help_text="Vide = calculé à partir du prix de la boîte")
    stock_minimum = models.PositiveIntegerField(default=0, help_text="Seuil d'alerte, en boîtes")
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
