from django.conf import settings
from django.db import models
from django.utils import timezone

from apps.commun.exceptions import ErreurMetier
from apps.commun.modeles import ModeleImmuable


class TypeModePaiement(models.TextChoices):
    ESPECES = "ESPECES", "Espèces"
    MOBILE = "MOBILE", "Paiement mobile"
    CARTE = "CARTE", "Carte bancaire"
    VIREMENT = "VIREMENT", "Virement"
    AUTRE = "AUTRE", "Autre"


class ModePaiement(models.Model):
    nom = models.CharField(max_length=60, unique=True)
    type = models.CharField(max_length=10, choices=TypeModePaiement.choices, default=TypeModePaiement.ESPECES)
    actif = models.BooleanField(default=True)

    class Meta:
        db_table = "modes_paiement"
        ordering = ["nom"]

    def __str__(self):
        return self.nom


class Caisse(models.Model):
    nom = models.CharField(max_length=80, unique=True)
    depot = models.ForeignKey("depots.Depot", on_delete=models.PROTECT, related_name="caisses")
    active = models.BooleanField(default=True)

    class Meta:
        db_table = "caisses"
        ordering = ["nom"]

    def __str__(self):
        return self.nom


class StatutSession(models.TextChoices):
    OUVERTE = "OUVERTE", "Ouverte"
    FERMEE = "FERMEE", "Fermée"


class SessionCaisse(models.Model):
    caissier = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="+")
    caisse = models.ForeignKey(Caisse, on_delete=models.PROTECT, related_name="sessions")
    date_ouverture = models.DateTimeField(default=timezone.now)
    date_fermeture = models.DateTimeField(null=True, blank=True)
    montant_initial = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    # Valeurs figées à la clôture :
    total_ventes = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    total_especes = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    total_autres_paiements = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    montant_attendu = models.DecimalField(max_digits=14, decimal_places=2, null=True, blank=True)
    montant_reel = models.DecimalField(max_digits=14, decimal_places=2, null=True, blank=True)
    ecart = models.DecimalField(max_digits=14, decimal_places=2, null=True, blank=True)
    statut = models.CharField(max_length=10, choices=StatutSession.choices, default=StatutSession.OUVERTE, db_index=True)
    note = models.CharField(max_length=255, blank=True)

    class Meta:
        db_table = "sessions_caisse"
        ordering = ["-date_ouverture", "-id"]

    def save(self, *args, **kwargs):
        if self.pk:
            ancien = type(self).objects.filter(pk=self.pk).values_list("statut", flat=True).first()
            if ancien == StatutSession.FERMEE:
                raise ErreurMetier("Une session clôturée ne peut plus être modifiée.")
        super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        raise ErreurMetier("Une session de caisse ne peut pas être supprimée.")

    def __str__(self):
        return f"Session {self.pk} — {self.caisse}"


class TypeMouvementCaisse(models.TextChoices):
    VENTE = "VENTE", "Vente"
    REMBOURSEMENT = "REMBOURSEMENT", "Remboursement"
    ENTREE_MANUELLE = "ENTREE_MANUELLE", "Entrée manuelle"
    SORTIE_MANUELLE = "SORTIE_MANUELLE", "Sortie manuelle"


class MouvementCaisse(ModeleImmuable):
    """Montant toujours positif ; le type indique le sens (VENTE / ENTREE_MANUELLE = +, autres = -)."""

    session = models.ForeignKey(SessionCaisse, on_delete=models.PROTECT, related_name="mouvements")
    type_mouvement = models.CharField(max_length=20, choices=TypeMouvementCaisse.choices)
    mode_paiement = models.ForeignKey(ModePaiement, on_delete=models.PROTECT, related_name="+")
    montant = models.DecimalField(max_digits=14, decimal_places=2)
    date_mouvement = models.DateTimeField(default=timezone.now)
    motif = models.CharField(max_length=255, blank=True)
    vente = models.ForeignKey("ventes.Vente", null=True, blank=True, on_delete=models.PROTECT, related_name="mouvements_caisse")
    utilisateur = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="+")

    class Meta:
        db_table = "mouvements_caisse"
        ordering = ["-date_mouvement", "-id"]
