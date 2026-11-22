from django.db import migrations, models


def mark_existing_profiles(apps, schema_editor):
    Profile = apps.get_model('dietary', 'Profile')
    # 기존 선택 조건 보유 프로필만 완료 상태 복원
    Profile.objects.using(schema_editor.connection.alias).filter(criteria__isnull=False).update(setup_completed=True)


class Migration(migrations.Migration):
    dependencies = [('dietary', '0002_seed_criteria')]
    operations = [
        migrations.AddField(model_name='profile', name='setup_completed',
                            field=models.BooleanField(default=False)),
        migrations.RunPython(mark_existing_profiles, migrations.RunPython.noop),
    ]
