from django.conf import settings
from django.db import models
from django.utils import timezone

from apps.commun.exceptions import ErreurMetier


class CategorieDepense(models.TextChoices):
    LOYER = "LOYER", "Loyer"
    ELECTRICITE = "ELECTRICITE", "Électricité"
    EAU = "EAU", "Eau"
    SALAIRES = "SALAIRES", "Salaires"
    INTERNET_TELEPHONE = "INTERNET_TELEPHONE", "Internet et téléphone"
    TRANSPORT = "TRANSPORT", "Transport"
    ENTRETIEN = "ENTRETIEN", "Entretien et réparations"
    TAXES = "TAXES", "Taxes et impôts"
    FOURNITURES = "FOURNITURES", "Fournitures"
    AUTRE = "AUTRE", "Autre"


class StatutDepense(models.TextChoices):
    VALIDEE = "VALIDEE", "Validée"
    ANNULEE = "ANNULEE", "Annulée"


class Depense(models.Model):
    """
    Charge de la pharmacie (loyer, électricité, salaires…). Jamais supprimée : une erreur s'annule (avec motif),
    et l'annulation d'une dépense payée en caisse remet l'espèce en caisse par un mouvement inverse.
    """

    reference = models.CharField(max_length=30, unique=True)
    categorie = models.CharField(max_length=20, choices=CategorieDepense.choices, db_index=True)
    libelle = models.CharField(max_length=200)
    montant = models.DecimalField(max_digits=14, decimal_places=2)
    date_depense = models.DateField(default=timezone.localdate, db_index=True)
    # Payée avec les espèces de la caisse (déduite du montant attendu) ou autrement (virement, mobile, banque…).
    payee_depuis_caisse = models.BooleanField(default=False)
    session = models.ForeignKey("caisse.SessionCaisse", null=True, blank=True, on_delete=models.PROTECT, related_name="depenses")
    mode_paiement = models.ForeignKey("caisse.ModePaiement", null=True, blank=True, on_delete=models.PROTECT, related_name="+")
    note = models.CharField(max_length=255, blank=True)
    utilisateur = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="+")
    date_creation = models.DateTimeField(default=timezone.now)
    statut = models.CharField(max_length=10, choices=StatutDepense.choices, default=StatutDepense.VALIDEE, db_index=True)
    date_annulation = models.DateTimeField(null=True, blank=True)
    annule_par = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.PROTECT, related_name="+")
    motif_annulation = models.CharField(max_length=255, blank=True)

    class Meta:
        db_table = "depenses"
        ordering = ["-date_depense", "-id"]

    def __str__(self):
        return self.reference

    def delete(self, *args, **kwargs):
        raise ErreurMetier("Une dépense ne peut pas être supprimée : annulez-la en indiquant un motif.")
