from rest_framework.routers import SimpleRouter

from .vues import ClientViewSet, RecuViewSet, VenteViewSet

routeur = SimpleRouter()
routeur.register("clients", ClientViewSet, basename="client")
routeur.register("ventes", VenteViewSet, basename="vente")
routeur.register("recus", RecuViewSet, basename="recu")
urlpatterns = routeur.urls
