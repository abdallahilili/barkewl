from apps.commun.constantes import TOUS_LES_ROLES
from apps.commun.vues_base import ViewSetGestion

from .models import Depot
from .serializers import DepotSerializer


class DepotViewSet(ViewSetGestion):
    queryset = Depot.objects.all()
    serializer_class = DepotSerializer
    roles_lecture = TOUS_LES_ROLES
    roles_ecriture = ()
    search_fields = ["nom", "description"]
    ordering_fields = ["nom", "date_creation"]

    def get_queryset(self):
        qs = super().get_queryset()
        actif = self.request.query_params.get("actif")
        if actif in ("0", "1"):
            qs = qs.filter(actif=(actif == "1"))
        return qs
