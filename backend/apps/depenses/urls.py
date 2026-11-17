from rest_framework.routers import SimpleRouter

from .vues import DepenseViewSet

routeur = SimpleRouter()
routeur.register("depenses", DepenseViewSet, basename="depense")
urlpatterns = routeur.urls
