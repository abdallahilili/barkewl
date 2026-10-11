from django.conf import settings
from django.db import models
from django.utils import timezone

from .modeles import ModeleImmuable


class Parametre(models.Model):
    cle = models.CharField(max_length=80, unique=True)
    valeur = models.TextField(blank=True)
    description = models.CharField(max_length=255, blank=True)

    class Meta:
        db_table = "parametres"

    def __str__(self):
        return self.cle


class SequenceDocument(models.Model):
    """Compteur annuel par préfixe (REC, ACH, TRF, INV) pour numéroter les documents."""

    prefixe = models.CharField(max_length=10)
    annee = models.PositiveSmallIntegerField()
    dernier_numero = models.PositiveIntegerField(default=0)

    class Meta:
        db_table = "sequences_documents"
        constraints = [models.UniqueConstraint(fields=["prefixe", "annee"], name="unique_sequence_prefixe_annee")]


class JournalAudit(ModeleImmuable):
    """Qui / quoi / quand / ancienne valeur / nouvelle valeur / référence."""

    date_action = models.DateTimeField(default=timezone.now, db_index=True)
    utilisateur = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, on_delete=models.PROTECT, related_name="+"
    )
    action = models.CharField(max_length=30)
    entite = models.CharField(max_length=80, db_index=True)
    entite_id = models.CharField(max_length=40, blank=True, db_index=True)
    reference = models.CharField(max_length=60, blank=True)
    ancienne_valeur = models.JSONField(null=True, blank=True)
    nouvelle_valeur = models.JSONField(null=True, blank=True)
    description = models.CharField(max_length=255, blank=True)

    class Meta:
        db_table = "journal_audit"
        ordering = ["-date_action", "-id"]
