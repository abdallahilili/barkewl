from rest_framework.routers import SimpleRouter

from .vues import AchatViewSet, BonCommandeViewSet

routeur = SimpleRouter()
routeur.register("achats", AchatViewSet, basename="achat")
routeur.register("bons-commande", BonCommandeViewSet, basename="bon-commande")
urlpatterns = routeur.urls
