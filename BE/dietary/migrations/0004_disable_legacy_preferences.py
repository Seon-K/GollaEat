from django.db import migrations


def disable_preferences(apps, schema_editor):
    # 기존 기록 보존 및 서비스 선택 항목 비활성화
    Criterion = apps.get_model('dietary', 'Criterion')
    Criterion.objects.using(schema_editor.connection.alias).filter(kind='preference').update(active=False)


class Migration(migrations.Migration):
    dependencies = [('dietary', '0003_profile_setup_completed')]
    operations = [migrations.RunPython(disable_preferences, migrations.RunPython.noop)]
