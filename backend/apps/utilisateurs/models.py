from django.contrib.auth.base_user import AbstractBaseUser, BaseUserManager
from django.db import models

from apps.commun.constantes import ADMIN, CAISSIER, MAGASINIER, ROLES  # noqa: F401


class GestionnaireUtilisateurs(BaseUserManager):
    def creer_utilisateur(self, identifiant, mot_de_passe, **extra):
        if not identifiant:
            raise ValueError("L'identifiant est obligatoire.")
        utilisateur = self.model(identifiant=identifiant, **extra)
        utilisateur.set_password(mot_de_passe)
        utilisateur.save(using=self._db)
        return utilisateur

    def get_by_natural_key(self, identifiant):
        return self.get(identifiant=identifiant)


class Utilisateur(AbstractBaseUser):
    identifiant = models.CharField(max_length=50, unique=True)
    nom = models.CharField(max_length=100)
    prenom = models.CharField(max_length=100, blank=True)
    email = models.EmailField(blank=True)
    telephone = models.CharField(max_length=30, blank=True)
    role = models.CharField(max_length=20, choices=ROLES, default=CAISSIER)
    actif = models.BooleanField(default=True)
    date_creation = models.DateTimeField(auto_now_add=True)

    # Noms imposés par Django / SimpleJWT, mais colonnes en français en base.
    password = models.CharField(max_length=128, db_column="mot_de_passe")
    last_login = models.DateTimeField(null=True, blank=True, db_column="derniere_connexion")

    USERNAME_FIELD = "identifiant"
    REQUIRED_FIELDS = ["nom"]
    objects = GestionnaireUtilisateurs()

    class Meta:
        db_table = "utilisateurs"
        ordering = ["nom", "prenom"]

    @property
    def is_active(self):
        return self.actif

    @property
    def nom_complet(self):
        return f"{self.prenom} {self.nom}".strip()

    def __str__(self):
        return self.nom_complet or self.identifiant
