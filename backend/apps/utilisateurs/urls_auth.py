from django.urls import path

from .vues import ChangerMotDePasseView, ConnexionView, MoiView, RafraichirView

urlpatterns = [
    path("connexion/", ConnexionView.as_view(), name="connexion"),
    path("rafraichir/", RafraichirView.as_view(), name="rafraichir"),
    path("moi/", MoiView.as_view(), name="moi"),
    path("changer-mot-de-passe/", ChangerMotDePasseView.as_view(), name="changer-mot-de-passe"),
]
