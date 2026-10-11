from rest_framework.exceptions import APIException


class ErreurMetier(APIException):
    """Règle métier non respectée : l'opération est annulée (HTTP 400)."""

    status_code = 400
    default_detail = "Opération impossible."
    default_code = "erreur_metier"


class NonAuthentifie(APIException):
    status_code = 401
    default_detail = "Authentification requise."
    default_code = "non_authentifie"
