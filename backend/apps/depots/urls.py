from rest_framework.routers import SimpleRouter

from .vues import DepotViewSet

routeur = SimpleRouter()
routeur.register("depots", DepotViewSet, basename="depot")
urlpatterns = routeur.urls
