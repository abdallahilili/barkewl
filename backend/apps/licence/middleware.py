import re

from django.conf import settings
from django.http import JsonResponse

from .services import etat_licence

METHODES_LECTURE = {"GET", "HEAD", "OPTIONS"}

# Toujours autorisé, même sans licence valide : se connecter, activer la licence,
# sauvegarder les données et clôturer la caisse du jour (compter l'argent déjà encaissé).
CHEMINS_TOUJOURS_AUTORISES = [
    re.compile(r"^/api/auth/"),
    re.compile(r"^/api/licence/"),
    re.compile(r"^/api/sauvegardes/"),
    re.compile(r"^/api/sessions-caisse/\d+/fermer/$"),
]


class LicenceMiddleware:
    """Licence expirée ou absente : consultation seule (toute écriture est refusée, sauf les exceptions ci-dessus)."""

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        if (getattr(settings, "LICENCE_OBLIGATOIRE", True)
                and request.method not in METHODES_LECTURE
                and request.path.startswith("/api/")
                and not any(motif.match(request.path) for motif in CHEMINS_TOUJOURS_AUTORISES)):
            etat = etat_licence()
            if etat["lecture_seule"]:
                return JsonResponse({"detail": etat["message"], "code": "licence"}, status=403)
        return self.get_response(request)
