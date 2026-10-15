from rest_framework.routers import SimpleRouter

from .vues import DocumentVenteViewSet

routeur = SimpleRouter()
routeur.register("documents-vente", DocumentVenteViewSet, basename="document-vente")
urlpatterns = routeur.urls
