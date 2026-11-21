import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('catalog', '0005_reportevent_fooddeclaration_applicability_scope_and_more'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name='GeocodeAttempt',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('provider', models.CharField(max_length=200)),
                ('mode', models.CharField(choices=[('address', '주소'), ('place', '장소명')], max_length=20)),
                ('query_address', models.TextField(blank=True)),
                ('query_place_name', models.CharField(blank=True, max_length=500)),
                ('existing_latitude', models.FloatField(blank=True, null=True)),
                ('existing_longitude', models.FloatField(blank=True, null=True)),
                ('status', models.CharField(choices=[('not_configured', 'not_configured'), ('error', 'error'), ('not_found', 'not_found'), ('ambiguous', 'ambiguous'), ('conflict', 'conflict'), ('unchanged', 'unchanged'), ('proposed', 'proposed'), ('applied_unverified', 'applied_unverified')], max_length=30)),
                ('candidates', models.JSONField(blank=True, default=list)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('applied_at', models.DateTimeField(blank=True, null=True)),
                ('applied_by', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='+', to=settings.AUTH_USER_MODEL)),
                ('requested_by', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='+', to=settings.AUTH_USER_MODEL)),
                ('restaurant', models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name='geocode_attempts', to='catalog.restaurant')),
            ],
        ),
    ]
