from django.urls import path
from rest_framework.routers import SimpleRouter

from .vues import IdentitePharmacieView, JournalAuditViewSet, ParametresView, SauvegardesView, TelechargerSauvegardeView

routeur = SimpleRouter()
routeur.register("journal-audit", JournalAuditViewSet, basename="journal-audit")

urlpatterns = [
    path("parametres/", ParametresView.as_view(), name="parametres"),
    path("identite-pharmacie/", IdentitePharmacieView.as_view(), name="identite-pharmacie"),
    path("sauvegardes/", SauvegardesView.as_view(), name="sauvegardes"),
    path("sauvegardes/<str:nom>/telecharger/", TelechargerSauvegardeView.as_view(), name="telecharger-sauvegarde"),
] + routeur.urls
