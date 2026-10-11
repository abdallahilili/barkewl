from rest_framework import mixins, viewsets

from .audit import enregistrer_audit, instantane


class AuditMixin:
    """Journalise créations et modifications (avec anciennes et nouvelles valeurs)."""

    def perform_create(self, serializer):
        instance = serializer.save()
        enregistrer_audit(
            self.request.user, "CREATION", instance.__class__.__name__, instance.pk,
            reference=str(instance), nouvelle=instantane(instance),
        )

    def perform_update(self, serializer):
        avant = instantane(serializer.instance)
        instance = serializer.save()
        apres = instantane(instance)
        modifies = [cle for cle in apres if apres[cle] != avant.get(cle)]
        if modifies:
            enregistrer_audit(
                self.request.user, "MODIFICATION", instance.__class__.__name__, instance.pk,
                reference=str(instance),
                ancienne={cle: avant.get(cle) for cle in modifies},
                nouvelle={cle: apres[cle] for cle in modifies},
            )


class ViewSetGestion(
    AuditMixin,
    mixins.CreateModelMixin,
    mixins.RetrieveModelMixin,
    mixins.UpdateModelMixin,
    mixins.ListModelMixin,
    viewsets.GenericViewSet,
):
    """Liste, consultation, création, modification. Pas de suppression : on désactive."""


class ViewSetLecture(mixins.RetrieveModelMixin, mixins.ListModelMixin, viewsets.GenericViewSet):
    pass
