from django.contrib import admin

from .models import Test


@admin.register(Test)
class TestAdmin(admin.ModelAdmin):
    list_display = ('id', 'data')
    search_fields = ('data',)
    ordering = ('id',)
