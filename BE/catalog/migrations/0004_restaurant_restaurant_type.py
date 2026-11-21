from django.db import migrations, models


def backfill_type(apps, schema_editor):
    Restaurant = apps.get_model('catalog', 'Restaurant')
    alias = schema_editor.connection.alias
    for row in Restaurant.objects.using(alias).iterator():
        row.restaurant_type = (row.data or {}).get('restaurant_type') or ''
        row.save(using=alias, update_fields=['restaurant_type'])


class Migration(migrations.Migration):

    dependencies = [
        ('catalog', '0003_backfill_catalog_fields'),
    ]

    operations = [
        migrations.AddField(
            model_name='restaurant',
            name='restaurant_type',
            field=models.CharField(blank=True, default='', max_length=30),
        ),
        migrations.RunPython(backfill_type, migrations.RunPython.noop),
    ]
