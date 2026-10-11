from rest_framework.routers import SimpleRouter

from .vues import FournisseurViewSet, PaiementFournisseurViewSet

routeur = SimpleRouter()
routeur.register("fournisseurs", FournisseurViewSet, basename="fournisseur")
routeur.register("paiements-fournisseur", PaiementFournisseurViewSet, basename="paiement-fournisseur")
urlpatterns = routeur.urls
