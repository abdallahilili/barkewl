from rest_framework.routers import SimpleRouter

from .vues import UtilisateurViewSet

routeur = SimpleRouter()
routeur.register("utilisateurs", UtilisateurViewSet, basename="utilisateur")
urlpatterns = routeur.urls
