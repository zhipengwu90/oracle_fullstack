from django.contrib import admin
from django.utils.html import format_html

from .models import Experience, Mortgage, Profile, Project, ProjectTag, SocialLink, Skill, Stat, Tag


@admin.register(Mortgage)
class MortgageAdmin(admin.ModelAdmin):
    list_display = ('id', 'data')
    search_fields = ('data',)
    ordering = ('id',)


@admin.register(Profile)
class ProfileAdmin(admin.ModelAdmin):
    list_display = ('full_name', 'role_title', 'email', 'updated_at')

    def has_add_permission(self, request):
        # Singleton: only one profile row should ever exist.
        return not Profile.objects.exists()


@admin.register(Stat)
class StatAdmin(admin.ModelAdmin):
    list_display = ('label', 'value', 'suffix', 'display_order')
    list_editable = ('display_order',)
    ordering = ('display_order',)


@admin.register(Skill)
class SkillAdmin(admin.ModelAdmin):
    list_display = ('name', 'category', 'is_featured', 'display_order')
    list_editable = ('display_order', 'is_featured')
    list_filter = ('category', 'is_featured')
    search_fields = ('name',)
    ordering = ('display_order',)


@admin.register(Experience)
class ExperienceAdmin(admin.ModelAdmin):
    list_display = ('position', 'company', 'start_date', 'end_date', 'display_order')
    list_editable = ('display_order',)
    ordering = ('display_order',)


@admin.register(Tag)
class TagAdmin(admin.ModelAdmin):
    list_display = ('name', 'slug')
    prepopulated_fields = {'slug': ('name',)}
    search_fields = ('name',)


class ProjectTagInline(admin.TabularInline):
    model = ProjectTag
    extra = 1
    autocomplete_fields = ('tag',)


@admin.register(Project)
class ProjectAdmin(admin.ModelAdmin):
    list_display = ('title', 'thumbnail', 'is_internal', 'is_in_progress', 'display_order')
    list_editable = ('display_order',)
    list_filter = ('is_internal', 'is_in_progress', 'tags')
    search_fields = ('title', 'description')
    inlines = [ProjectTagInline]
    prepopulated_fields = {'slug': ('title',)}
    ordering = ('display_order',)

    @admin.display(description='Image')
    def thumbnail(self, obj):
        if not obj.image:
            return '—'
        return format_html('<img src="{}" style="height:40px;border-radius:4px;" />', obj.image.url)


@admin.register(SocialLink)
class SocialLinkAdmin(admin.ModelAdmin):
    list_display = ('platform', 'label', 'url', 'display_order')
    list_editable = ('display_order',)
    ordering = ('display_order',)
