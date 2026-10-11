from django.urls import path
from rest_framework.routers import SimpleRouter

from .vues import IdentitePharmacieView, JournalAuditViewSet, ParametresView

routeur = SimpleRouter()
routeur.register("journal-audit", JournalAuditViewSet, basename="journal-audit")

urlpatterns = [
    path("parametres/", ParametresView.as_view(), name="parametres"),
    path("identite-pharmacie/", IdentitePharmacieView.as_view(), name="identite-pharmacie"),
] + routeur.urls
