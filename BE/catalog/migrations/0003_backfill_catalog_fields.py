from django.db import migrations


def backfill(apps, schema_editor):
    Restaurant = apps.get_model('catalog', 'Restaurant')
    Menu = apps.get_model('catalog', 'Menu')
    alias = schema_editor.connection.alias
    for row in Restaurant.objects.using(alias).iterator():
        data = row.data or {}
        row.address, row.phone = data.get('address') or '', data.get('phone') or ''
        row.brand, row.category = data.get('brand') or '', data.get('category') or ''
        row.latitude, row.longitude = data.get('latitude'), data.get('longitude')
        row.save(using=alias, update_fields=['address', 'phone', 'brand', 'category', 'latitude', 'longitude'])
    for row in Menu.objects.using(alias).iterator():
        row.description, row.category = (row.data or {}).get('description') or '', (row.data or {}).get('category') or ''
        row.save(using=alias, update_fields=['description', 'category'])


class Migration(migrations.Migration):
    dependencies = [('catalog', '0002_catalogsource_menu_category_menu_description_and_more')]
    operations = [migrations.RunPython(backfill, migrations.RunPython.noop)]
