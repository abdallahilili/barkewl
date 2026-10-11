from rest_framework.permissions import SAFE_METHODS, BasePermission

from .constantes import ADMIN


class PermissionParRole(BasePermission):
    """
    Permission simple basée sur le rôle. Chaque vue déclare :
      roles_lecture        rôles autorisés pour GET/HEAD/OPTIONS
      roles_ecriture       rôles autorisés pour les autres méthodes
      roles_par_action     exceptions par action (ex. {"valider": (MAGASINIER,)})
    L'administrateur a toujours accès. Sans déclaration, seul l'administrateur passe.
    """

    message = "Vous n'avez pas le droit d'effectuer cette opération."

    def has_permission(self, request, view):
        utilisateur = request.user
        if not utilisateur or not utilisateur.is_authenticated:
            return False
        if utilisateur.role == ADMIN:
            return True
        action = getattr(view, "action", None)
        par_action = getattr(view, "roles_par_action", {})
        if action in par_action:
            return utilisateur.role in par_action[action]
        if request.method in SAFE_METHODS:
            roles = getattr(view, "roles_lecture", None)
            if roles is None:
                roles = getattr(view, "roles_ecriture", ())
        else:
            roles = getattr(view, "roles_ecriture", ())
        return utilisateur.role in roles
