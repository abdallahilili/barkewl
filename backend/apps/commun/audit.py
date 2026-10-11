from datetime import date, datetime
from decimal import Decimal

from .models import JournalAudit

CHAMPS_IGNORES = {"password", "last_login"}


def _serialisable(valeur):
    if isinstance(valeur, Decimal):
        return str(valeur)
    if isinstance(valeur, (date, datetime)):
        return valeur.isoformat()
    if valeur is None or isinstance(valeur, (int, float, str, bool)):
        return valeur
    return str(valeur)


def instantane(instance):
    """Photographie des champs d'un objet (pour comparer avant/après)."""
    return {
        champ.attname: _serialisable(getattr(instance, champ.attname))
        for champ in instance._meta.concrete_fields
        if champ.attname not in CHAMPS_IGNORES
    }


def enregistrer_audit(utilisateur, action, entite, entite_id="", reference="", ancienne=None, nouvelle=None, description=""):
    return JournalAudit.objects.create(
        utilisateur=utilisateur if getattr(utilisateur, "pk", None) else None,
        action=action,
        entite=entite,
        entite_id=str(entite_id),
        reference=reference,
        ancienne_valeur=ancienne,
        nouvelle_valeur=nouvelle,
        description=description,
    )
