import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('catalog', '0004_restaurant_restaurant_type'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name='ReportEvent',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('action', models.CharField(max_length=30)),
                ('before', models.JSONField(blank=True, default=dict)),
                ('after', models.JSONField(blank=True, default=dict)),
                ('notes', models.TextField(blank=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
            ],
        ),
        migrations.AddField(
            model_name='fooddeclaration',
            name='applicability_scope',
            field=models.CharField(blank=True, help_text='메뉴/구성품/브랜드 참고 등 원문 적용 범위', max_length=100),
        ),
        migrations.CreateModel(
            name='AllergenLink',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('external_menu_id', models.CharField(max_length=100)),
                ('brand', models.CharField(max_length=200)),
                ('match_method', models.CharField(default='place_id_brand_exact_menu', max_length=100)),
                ('status', models.CharField(choices=[('reference', '참고'), ('verified_source', '검토된 출처의 포함 정보'), ('inactive', '재확인 필요')], default='reference', max_length=30)),
                ('payload', models.JSONField(blank=True, default=dict)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('menu', models.OneToOneField(on_delete=django.db.models.deletion.PROTECT, related_name='allergen_link', to='catalog.menu')),
                ('source', models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, to='catalog.catalogsource')),
            ],
        ),
        migrations.AddField(
            model_name='fooddeclaration',
            name='import_link',
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.PROTECT, related_name='declarations', to='catalog.allergenlink'),
        ),
        migrations.AddConstraint(
            model_name='fooddeclaration',
            constraint=models.UniqueConstraint(fields=('import_link', 'canonical_tag'), name='catalog_unique_import_tag'),
        ),
        migrations.AddField(
            model_name='reportevent',
            name='report',
            field=models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name='events', to='catalog.informationreport'),
        ),
        migrations.AddField(
            model_name='reportevent',
            name='reviewer',
            field=models.ForeignKey(null=True, on_delete=django.db.models.deletion.SET_NULL, to=settings.AUTH_USER_MODEL),
        ),
    ]
