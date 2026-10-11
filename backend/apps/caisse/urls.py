from rest_framework.routers import SimpleRouter

from .vues import CaisseViewSet, ModePaiementViewSet, SessionCaisseViewSet

routeur = SimpleRouter()
routeur.register("modes-paiement", ModePaiementViewSet, basename="mode-paiement")
routeur.register("caisses", CaisseViewSet, basename="caisse")
routeur.register("sessions-caisse", SessionCaisseViewSet, basename="session-caisse")
urlpatterns = routeur.urls
