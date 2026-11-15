"""
Approbation sur place par code PIN : le propriétaire ou le pharmacien saisit son identifiant et son PIN
sur l'écran du vendeur, sans que celui-ci ne se déconnecte. L'approbateur est enregistré dans le journal.
"""
from django.core.cache import cache

from apps.commun.constantes import ROLES_APPROBATEURS
from apps.commun.exceptions import ErreurMetier

from .models import Utilisateur

ESSAIS_MAX = 5
BLOCAGE_SECONDES = 10 * 60


def verifier_approbation(identifiant, code_pin):
    """Renvoie l'approbateur si l'identifiant et le PIN sont corrects ; bloque après 5 erreurs (10 minutes)."""
    identifiant = (identifiant or "").strip()
    cle = f"pin-echecs:{identifiant.lower()}"
    if cache.get(cle, 0) >= ESSAIS_MAX:
        raise ErreurMetier("Trop d'essais de code PIN : réessayez dans 10 minutes.")
    approbateur = Utilisateur.objects.filter(identifiant=identifiant, actif=True, role__in=ROLES_APPROBATEURS).first()
    if approbateur is None or not approbateur.verifier_code_pin(str(code_pin or "")):
        cache.set(cle, cache.get(cle, 0) + 1, BLOCAGE_SECONDES)
        raise ErreurMetier("Approbation refusée : identifiant ou code PIN incorrect "
                           "(seul un propriétaire ou un pharmacien ayant défini son PIN peut approuver).")
    cache.delete(cle)
    return approbateur
