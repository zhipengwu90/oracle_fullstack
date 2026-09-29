from django.db import models


class Mortgage(models.Model):
    """
    Maps to the existing "mortgage" table in the myapp_v1 schema.

    managed = False -> Django never creates/alters/drops this table via
    migrations; it only reads/writes rows. The bare db_table = 'mortgage'
    resolves to myapp_v1.mortgage through the connection search_path
    (DB_SCHEMA=myapp_v1, set in settings.py / .env).
    """
    id = models.BigIntegerField(primary_key=True)
    data = models.TextField(blank=True, null=True)

    class Meta:
        managed = False
        db_table = 'mortgage'


class Topic(models.Model):
    """
    Maps to the existing "topics" table in the myapp_v1 schema.

    managed = False, same reasoning as Mortgage above.
    """
    tp_id = models.BigIntegerField(primary_key=True)
    source = models.TextField(blank=True, null=True)
    content = models.TextField(blank=True, null=True)
    created_date = models.DateField(blank=True, null=True)
    ai_suggestion = models.TextField(blank=True, null=True)

    class Meta:
        managed = False
        db_table = 'topics'


# ---------------------------------------------------------------------------
# Portfolio content. All tables created by hand via sql/portfolio_schema.sql
# (see that file) and edited through Django Admin, not manage.py migrate -
# same managed = False convention as Mortgage/Topic above.
# ---------------------------------------------------------------------------

class Profile(models.Model):
    """Maps to "portfolio_profile". Singleton: exactly one row."""
    full_name = models.CharField(max_length=150)
    role_title = models.CharField(max_length=200)
    hero_heading = models.CharField(max_length=200)
    hero_bio = models.TextField()
    about_heading = models.CharField(max_length=200, default='About Me')
    about_bio = models.TextField()
    hero_image = models.ImageField(upload_to='portfolio/profile/', max_length=255, blank=True, null=True)
    about_image = models.ImageField(upload_to='portfolio/profile/', max_length=255, blank=True, null=True)
    email = models.EmailField(blank=True, null=True)
    location = models.CharField(max_length=150, blank=True, null=True)
    resume_url = models.URLField(max_length=500, blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        managed = False
        db_table = 'portfolio_profile'

    def __str__(self):
        return self.full_name


class Stat(models.Model):
    """Maps to "portfolio_stat" -- About-page counters (e.g. "20+ Projects")."""
    label = models.CharField(max_length=100)
    value = models.IntegerField()
    suffix = models.CharField(max_length=10, default='+')
    display_order = models.IntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        managed = False
        db_table = 'portfolio_stat'
        ordering = ['display_order', 'id']

    def __str__(self):
        return f'{self.label}: {self.value}{self.suffix}'


class Skill(models.Model):
    """Maps to "portfolio_skill". is_featured -> shown as a hero tech badge."""
    name = models.CharField(max_length=100)
    category = models.CharField(max_length=100, blank=True, null=True)
    is_featured = models.BooleanField(default=False)
    display_order = models.IntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        managed = False
        db_table = 'portfolio_skill'
        ordering = ['display_order', 'id']

    def __str__(self):
        return self.name


class Experience(models.Model):
    """Maps to "portfolio_experience". end_date = NULL means "Present"."""
    position = models.CharField(max_length=200)
    company = models.CharField(max_length=200)
    company_url = models.URLField(max_length=500, blank=True, null=True)
    location = models.CharField(max_length=150, blank=True, null=True)
    start_date = models.DateField()
    end_date = models.DateField(blank=True, null=True)
    description = models.TextField()
    display_order = models.IntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        managed = False
        db_table = 'portfolio_experience'
        ordering = ['display_order', 'id']

    def __str__(self):
        return f'{self.position} @ {self.company}'


class Tag(models.Model):
    """Maps to "portfolio_tag" -- shared vocabulary used to filter projects."""
    name = models.CharField(max_length=100, unique=True)
    slug = models.SlugField(max_length=110, unique=True)

    class Meta:
        managed = False
        db_table = 'portfolio_tag'
        ordering = ['name']

    def __str__(self):
        return self.name


class Project(models.Model):
    """Maps to "portfolio_project"."""
    title = models.CharField(max_length=200)
    slug = models.SlugField(max_length=220, unique=True)
    description = models.TextField()
    image = models.ImageField(upload_to='portfolio/projects/', max_length=255, blank=True, null=True)
    project_url = models.URLField(max_length=500, blank=True, null=True)
    github_url = models.URLField(max_length=500, blank=True, null=True)
    app_store_url = models.URLField(max_length=500, blank=True, null=True)
    is_internal = models.BooleanField(default=False)
    is_in_progress = models.BooleanField(default=False)
    display_order = models.IntegerField(default=0)
    tags = models.ManyToManyField(Tag, through='ProjectTag', related_name='projects', blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        managed = False
        db_table = 'portfolio_project'
        ordering = ['display_order', 'id']

    def __str__(self):
        return self.title


class ProjectTag(models.Model):
    """
    Maps to "portfolio_project_tag", the through table for Project.tags.
    Plain two-FK through table, so ProjectAdmin.filter_horizontal can manage
    it directly without a separate inline.
    """
    project = models.ForeignKey(Project, on_delete=models.CASCADE, db_column='project_id')
    tag = models.ForeignKey(Tag, on_delete=models.CASCADE, db_column='tag_id')

    class Meta:
        managed = False
        db_table = 'portfolio_project_tag'
        unique_together = (('project', 'tag'),)


class SocialLink(models.Model):
    """Maps to "portfolio_social_link" -- e.g. GitHub/LinkedIn/email links."""
    platform = models.CharField(max_length=50)
    label = models.CharField(max_length=100)
    url = models.CharField(max_length=500)
    display_order = models.IntegerField(default=0)

    class Meta:
        managed = False
        db_table = 'portfolio_social_link'
        ordering = ['display_order', 'id']

    def __str__(self):
        return self.label
