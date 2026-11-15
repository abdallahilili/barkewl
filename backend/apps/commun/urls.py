from django.urls import path
from rest_framework.routers import SimpleRouter

from .vues import (
    IdentitePharmacieView, JournalAuditViewSet, ParametresView, SauvegardesView, SauvegardeUsbCopierView,
    SauvegardeUsbLecteursView, SauvegardeUsbPreparerView, TelechargerSauvegardeView,
)

routeur = SimpleRouter()
routeur.register("journal-audit", JournalAuditViewSet, basename="journal-audit")

urlpatterns = [
    path("parametres/", ParametresView.as_view(), name="parametres"),
    path("identite-pharmacie/", IdentitePharmacieView.as_view(), name="identite-pharmacie"),
    path("sauvegardes/", SauvegardesView.as_view(), name="sauvegardes"),
    path("sauvegardes/usb/lecteurs/", SauvegardeUsbLecteursView.as_view(), name="sauvegardes-usb-lecteurs"),
    path("sauvegardes/usb/preparer/", SauvegardeUsbPreparerView.as_view(), name="sauvegardes-usb-preparer"),
    path("sauvegardes/usb/copier/", SauvegardeUsbCopierView.as_view(), name="sauvegardes-usb-copier"),
    path("sauvegardes/<str:nom>/telecharger/", TelechargerSauvegardeView.as_view(), name="telecharger-sauvegarde"),
] + routeur.urls
