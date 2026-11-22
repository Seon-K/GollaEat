import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('catalog', '0006_geocodeattempt'),
    ]

    operations = [
        migrations.CreateModel(
            name='MenuAnalysisReference',
            fields=[
                ('menu', models.OneToOneField(on_delete=django.db.models.deletion.PROTECT, primary_key=True, related_name='analysis_reference', serialize=False, to='catalog.menu')),
                ('explicit_ingredients', models.JSONField(blank=True, default=list)),
                ('explicit_components', models.JSONField(blank=True, default=list)),
                ('gemini_estimated_ingredients', models.JSONField(blank=True, default=list)),
                ('ingredient_source', models.CharField(max_length=40)),
                ('evidence_level', models.CharField(max_length=40)),
                ('information_status', models.CharField(max_length=40)),
                ('gemini_status', models.CharField(blank=True, max_length=100)),
                ('public_food_code', models.TextField(blank=True)),
                ('public_food_name', models.TextField(blank=True)),
                ('public_allergens', models.TextField(blank=True)),
                ('public_allergy_raw', models.TextField(blank=True)),
                ('public_reference_status', models.CharField(default='UNVERIFIED_SIMILAR_FOOD', max_length=50)),
                ('restaurant_ingredient_verification', models.CharField(default='NOT_VERIFIED', max_length=50)),
                ('allergy_safety_status', models.CharField(default='UNKNOWN_NOT_VERIFIED', max_length=50)),
                ('payload', models.JSONField(blank=True, default=dict)),
                ('source_filename', models.CharField(max_length=255)),
                ('source_sha256', models.CharField(max_length=64)),
                ('imported_at', models.DateTimeField(auto_now=True)),
            ],
        ),
    ]
