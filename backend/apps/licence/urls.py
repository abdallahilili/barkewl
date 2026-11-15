from django.urls import path

from .vues import ActiverLicenceView, LicenceView

urlpatterns = [
    path("licence/", LicenceView.as_view(), name="licence"),
    path("licence/activer/", ActiverLicenceView.as_view(), name="activer-licence"),
]
