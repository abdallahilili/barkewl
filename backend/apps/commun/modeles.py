from django.db import models

from .exceptions import ErreurMetier


class QuerySetImmuable(models.QuerySet):
    def update(self, **kwargs):
        raise ErreurMetier("Enregistrement immuable : modification interdite.")

    def delete(self):
        raise ErreurMetier("Enregistrement immuable : suppression interdite.")


class ModeleImmuable(models.Model):
    """Enregistrement créé une fois pour toutes (historique, journal d'audit)."""

    objects = QuerySetImmuable.as_manager()

    class Meta:
        abstract = True

    def save(self, *args, **kwargs):
        if not self._state.adding:
            raise ErreurMetier("Enregistrement immuable : modification interdite.")
        super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        raise ErreurMetier("Enregistrement immuable : suppression interdite.")
