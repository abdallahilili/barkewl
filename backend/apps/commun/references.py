from django.db import transaction
from django.utils import timezone

from .models import SequenceDocument


def prochaine_reference(prefixe):
    """Retourne par exemple REC-2026-00125. Le verrou de ligne évite les doublons."""
    annee = timezone.localdate().year
    with transaction.atomic():
        sequence, _ = SequenceDocument.objects.select_for_update().get_or_create(prefixe=prefixe, annee=annee)
        sequence.dernier_numero += 1
        sequence.save(update_fields=["dernier_numero"])
    return f"{prefixe}-{annee}-{sequence.dernier_numero:05d}"
