from rest_framework.routers import SimpleRouter

from .vues import ClientViewSet, RecuViewSet, RetourVenteViewSet, VenteViewSet

routeur = SimpleRouter()
routeur.register("clients", ClientViewSet, basename="client")
routeur.register("ventes", VenteViewSet, basename="vente")
routeur.register("retours-clients", RetourVenteViewSet, basename="retour-client")
routeur.register("recus", RecuViewSet, basename="recu")
urlpatterns = routeur.urls
