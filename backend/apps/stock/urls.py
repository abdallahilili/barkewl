from django.urls import path
from rest_framework.routers import SimpleRouter

from .vues import AlertesView, InventaireViewSet, MouvementStockViewSet, StockViewSet, TransfertViewSet

routeur = SimpleRouter()
routeur.register("stocks", StockViewSet, basename="stock")
routeur.register("mouvements-stock", MouvementStockViewSet, basename="mouvement-stock")
routeur.register("transferts", TransfertViewSet, basename="transfert")
routeur.register("inventaires", InventaireViewSet, basename="inventaire")

urlpatterns = [path("alertes/", AlertesView.as_view(), name="alertes")] + routeur.urls
