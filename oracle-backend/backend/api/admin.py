from django.contrib import admin

from .models import Mortgage


@admin.register(Mortgage)
class MortgageAdmin(admin.ModelAdmin):
    list_display = ('id', 'data')
    search_fields = ('data',)
    ordering = ('id',)
