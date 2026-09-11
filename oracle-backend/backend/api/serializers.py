from rest_framework import serializers

from .models import Mortgage


class MortgageSerializer(serializers.ModelSerializer):
    class Meta:
        model = Mortgage
        fields = ['id', 'data']
