from rest_framework.routers import SimpleRouter

from .vues import CategorieViewSet, LotViewSet, MedicamentViewSet

routeur = SimpleRouter()
routeur.register("categories", CategorieViewSet, basename="categorie")
routeur.register("medicaments", MedicamentViewSet, basename="medicament")
routeur.register("lots", LotViewSet, basename="lot")
urlpatterns = routeur.urls
