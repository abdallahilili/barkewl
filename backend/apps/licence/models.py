from django.db import models


class EtatLicence(models.Model):
    """Ligne unique : clé de licence installée et dernière date vue (détection d'un recul de l'horloge)."""

    cle = models.TextField(blank=True)
    date_activation = models.DateTimeField(null=True, blank=True)
    derniere_date_vue = models.DateField(null=True, blank=True)

    class Meta:
        db_table = "licence"
