from rest_framework.routers import SimpleRouter

from .vues import CategorieViewSet, DosageViewSet, FormeViewSet, LotViewSet, MedicamentViewSet

routeur = SimpleRouter()
routeur.register("categories", CategorieViewSet, basename="categorie")
routeur.register("formes", FormeViewSet, basename="forme")
routeur.register("dosages", DosageViewSet, basename="dosage")
routeur.register("medicaments", MedicamentViewSet, basename="medicament")
routeur.register("lots", LotViewSet, basename="lot")
urlpatterns = routeur.urls
