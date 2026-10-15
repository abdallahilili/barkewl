from django.urls import include, path

urlpatterns = [
    path("api/auth/", include("apps.utilisateurs.urls_auth")),
    path("api/", include("apps.utilisateurs.urls")),
    path("api/", include("apps.commun.urls")),
    path("api/", include("apps.depots.urls")),
    path("api/", include("apps.medicaments.urls")),
    path("api/", include("apps.stock.urls")),
    path("api/", include("apps.fournisseurs.urls")),
    path("api/", include("apps.achats.urls")),
    path("api/", include("apps.ventes.urls")),
    path("api/", include("apps.caisse.urls")),
    path("api/", include("apps.facturation.urls")),
    path("api/", include("apps.rapports.urls")),
]
