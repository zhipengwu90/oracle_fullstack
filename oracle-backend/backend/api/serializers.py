from rest_framework import serializers

from .models import (
    Experience,
    Mortgage,
    Profile,
    Project,
    SocialLink,
    Skill,
    Stat,
    Tag,
    Topic,
)


class MortgageSerializer(serializers.ModelSerializer):
    class Meta:
        model = Mortgage
        fields = ['id', 'data']


class TopicSerializer(serializers.ModelSerializer):
    class Meta:
        model = Topic
        fields = ['tp_id', 'source', 'content', 'created_date', 'ai_suggestion']


# ---------------------------------------------------------------------------
# Portfolio content - all read-only (writes happen through Django Admin).
#
# Image fields deliberately return a plain relative URL (obj.image.url)
# instead of using DRF's default FileField representation, which would call
# request.build_absolute_uri() and bake in the internal Docker hostname
# (http://backend:8000/...) - unreachable from the browser. A relative URL
# lets nginx's /media proxy resolve it correctly in every environment, the
# same way /static already works.
# ---------------------------------------------------------------------------

class ProfileSerializer(serializers.ModelSerializer):
    hero_image = serializers.SerializerMethodField()
    about_image = serializers.SerializerMethodField()

    class Meta:
        model = Profile
        fields = [
            'full_name', 'role_title', 'hero_heading', 'hero_bio',
            'about_heading', 'about_bio', 'hero_image', 'about_image',
            'email', 'location', 'resume_url',
        ]

    def get_hero_image(self, obj):
        return obj.hero_image.url if obj.hero_image else None

    def get_about_image(self, obj):
        return obj.about_image.url if obj.about_image else None


class StatSerializer(serializers.ModelSerializer):
    class Meta:
        model = Stat
        fields = ['id', 'label', 'value', 'suffix']


class SkillSerializer(serializers.ModelSerializer):
    class Meta:
        model = Skill
        fields = ['id', 'name', 'category', 'is_featured']


class ExperienceSerializer(serializers.ModelSerializer):
    class Meta:
        model = Experience
        fields = [
            'id', 'position', 'company', 'company_url', 'location',
            'start_date', 'end_date', 'description',
        ]


class TagSerializer(serializers.ModelSerializer):
    class Meta:
        model = Tag
        fields = ['id', 'name', 'slug']


class ProjectSerializer(serializers.ModelSerializer):
    image = serializers.SerializerMethodField()
    tags = TagSerializer(many=True, read_only=True)

    class Meta:
        model = Project
        fields = [
            'id', 'title', 'slug', 'description', 'image', 'project_url',
            'github_url', 'app_store_url', 'is_internal', 'is_in_progress',
            'tags',
        ]

    def get_image(self, obj):
        return obj.image.url if obj.image else None


class SocialLinkSerializer(serializers.ModelSerializer):
    class Meta:
        model = SocialLink
        fields = ['id', 'platform', 'label', 'url']
