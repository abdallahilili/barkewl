from rest_framework import serializers

from .models import Depot


class DepotSerializer(serializers.ModelSerializer):
    class Meta:
        model = Depot
        fields = ["id", "nom", "description", "actif", "date_creation"]
        read_only_fields = ["date_creation"]
