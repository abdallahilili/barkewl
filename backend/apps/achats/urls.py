from rest_framework.routers import SimpleRouter

from .vues import AchatViewSet

routeur = SimpleRouter()
routeur.register("achats", AchatViewSet, basename="achat")
urlpatterns = routeur.urls
