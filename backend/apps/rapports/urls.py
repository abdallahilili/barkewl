from django.urls import path

from .vues import (
    RapportAchatsView, RapportCaisseView, RapportMouvementsView, RapportStockView, RapportVentesView,
    TableauDeBordView,
)
from .vues_gestion import RapportBeneficeView, RapportFournisseurView, RapportProduitsView

urlpatterns = [
    path("tableau-de-bord/", TableauDeBordView.as_view(), name="tableau-de-bord"),
    path("rapports/ventes/", RapportVentesView.as_view(), name="rapport-ventes"),
    path("rapports/achats/", RapportAchatsView.as_view(), name="rapport-achats"),
    path("rapports/caisse/", RapportCaisseView.as_view(), name="rapport-caisse"),
    path("rapports/mouvements/", RapportMouvementsView.as_view(), name="rapport-mouvements"),
    path("rapports/produits/", RapportProduitsView.as_view(), name="rapport-produits"),
    path("rapports/benefice/", RapportBeneficeView.as_view(), name="rapport-benefice"),
    path("rapports/fournisseur/", RapportFournisseurView.as_view(), name="rapport-fournisseur"),
    path("rapports/stock/", RapportStockView.as_view(), name="rapport-stock"),
]
