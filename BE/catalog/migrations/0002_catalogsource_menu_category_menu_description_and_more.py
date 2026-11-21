import django.core.validators
import django.db.models.deletion
import uuid
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('catalog', '0001_initial'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name='CatalogSource',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('title', models.CharField(max_length=300)),
                ('url', models.URLField(blank=True, max_length=1000)),
                ('evidence_locator', models.CharField(blank=True, max_length=1000)),
                ('source_type', models.CharField(choices=[('official', '공식'), ('store', '매장 확인'), ('user', '이용자'), ('reference', '일반 참고')], default='reference', max_length=30)),
                ('checked_at', models.DateTimeField(blank=True, null=True)),
                ('valid_until', models.DateTimeField(blank=True, null=True)),
                ('notes', models.TextField(blank=True)),
            ],
        ),
        migrations.AddField(
            model_name='menu',
            name='category',
            field=models.CharField(blank=True, default='', max_length=100),
        ),
        migrations.AddField(
            model_name='menu',
            name='description',
            field=models.TextField(blank=True, default=''),
        ),
        migrations.AddField(
            model_name='menu',
            name='sale_status',
            field=models.CharField(choices=[('unverified', '미확인'), ('available', '판매 확인'), ('unavailable', '판매 중지 확인')], default='unverified', max_length=20),
        ),
        migrations.AddField(
            model_name='restaurant',
            name='address',
            field=models.TextField(blank=True, default=''),
        ),
        migrations.AddField(
            model_name='restaurant',
            name='brand',
            field=models.CharField(blank=True, default='', max_length=200),
        ),
        migrations.AddField(
            model_name='restaurant',
            name='category',
            field=models.CharField(blank=True, default='', max_length=100),
        ),
        migrations.AddField(
            model_name='restaurant',
            name='delivery',
            field=models.BooleanField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='restaurant',
            name='directions_url',
            field=models.URLField(blank=True, max_length=1000),
        ),
        migrations.AddField(
            model_name='restaurant',
            name='hours_confirmed_at',
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='restaurant',
            name='latitude',
            field=models.FloatField(blank=True, null=True, validators=[django.core.validators.MinValueValidator(-90), django.core.validators.MaxValueValidator(90)]),
        ),
        migrations.AddField(
            model_name='restaurant',
            name='longitude',
            field=models.FloatField(blank=True, null=True, validators=[django.core.validators.MinValueValidator(-180), django.core.validators.MaxValueValidator(180)]),
        ),
        migrations.AddField(
            model_name='restaurant',
            name='phone',
            field=models.CharField(blank=True, default='', max_length=100),
        ),
        migrations.AddField(
            model_name='restaurant',
            name='reservation_url',
            field=models.URLField(blank=True, max_length=1000),
        ),
        migrations.AddField(
            model_name='restaurant',
            name='takeaway',
            field=models.BooleanField(blank=True, null=True),
        ),
        migrations.AlterField(
            model_name='menu',
            name='data',
            field=models.JSONField(blank=True, default=dict),
        ),
        migrations.AlterField(
            model_name='restaurant',
            name='data',
            field=models.JSONField(blank=True, default=dict),
        ),
        migrations.AddField(
            model_name='restaurant',
            name='hours_source',
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.PROTECT, to='catalog.catalogsource'),
        ),
        migrations.CreateModel(
            name='InformationReport',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('owner_token', models.UUIDField(default=uuid.uuid4, editable=False)),
                ('category', models.CharField(choices=[('menu_price', '메뉴·가격'), ('ingredients_allergens', '재료·알레르겐'), ('business', '영업정보'), ('other', '기타')], max_length=30)),
                ('content', models.TextField(max_length=5000)),
                ('proposed_changes', models.JSONField(blank=True, default=dict)),
                ('status', models.CharField(choices=[('pending', '접수'), ('reviewing', '검토 중'), ('resolved', '반영 완료'), ('rejected', '반려')], default='pending', max_length=20)),
                ('review_notes', models.TextField(blank=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('reviewed_at', models.DateTimeField(blank=True, null=True)),
                ('menu', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.PROTECT, to='catalog.menu')),
                ('restaurant', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.PROTECT, to='catalog.restaurant')),
                ('reviewed_by', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='+', to=settings.AUTH_USER_MODEL)),
                ('user', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, to=settings.AUTH_USER_MODEL)),
            ],
        ),
        migrations.CreateModel(
            name='OptionGroup',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('name', models.CharField(max_length=200)),
                ('min_select', models.PositiveSmallIntegerField(default=0)),
                ('max_select', models.PositiveSmallIntegerField(default=1)),
                ('menu', models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name='option_groups', to='catalog.menu')),
                ('source', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.PROTECT, to='catalog.catalogsource')),
            ],
        ),
        migrations.CreateModel(
            name='MenuComponent',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('name', models.CharField(max_length=200)),
                ('role', models.CharField(choices=[('sauce', '소스'), ('topping', '토핑'), ('side', '사이드'), ('drink', '음료'), ('menu', '구성 메뉴')], max_length=20)),
                ('extra_price', models.BigIntegerField(blank=True, null=True, validators=[django.core.validators.MinValueValidator(0)])),
                ('is_default', models.BooleanField(default=False)),
                ('instructions', models.TextField(blank=True)),
                ('menu', models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name='components', to='catalog.menu')),
                ('source', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.PROTECT, to='catalog.catalogsource')),
                ('group', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.PROTECT, related_name='components', to='catalog.optiongroup')),
            ],
        ),
        migrations.CreateModel(
            name='BusinessHours',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('weekday', models.PositiveSmallIntegerField(help_text='월요일 0 ~ 일요일 6', validators=[django.core.validators.MaxValueValidator(6)])),
                ('is_closed', models.BooleanField(default=False)),
                ('opens_at', models.TimeField(blank=True, null=True)),
                ('closes_at', models.TimeField(blank=True, null=True)),
                ('closes_next_day', models.BooleanField(default=False)),
                ('break_start', models.TimeField(blank=True, null=True)),
                ('break_end', models.TimeField(blank=True, null=True)),
                ('restaurant', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='business_hours', to='catalog.restaurant')),
            ],
            options={
                'constraints': [models.UniqueConstraint(fields=('restaurant', 'weekday'), name='catalog_unique_weekday')],
            },
        ),
        migrations.CreateModel(
            name='Closure',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('date', models.DateField()),
                ('reason', models.CharField(blank=True, max_length=300)),
                ('restaurant', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='closures', to='catalog.restaurant')),
                ('source', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.PROTECT, to='catalog.catalogsource')),
            ],
            options={
                'constraints': [models.UniqueConstraint(fields=('restaurant', 'date'), name='catalog_unique_closure')],
            },
        ),
        migrations.CreateModel(
            name='FoodDeclaration',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('kind', models.CharField(choices=[('ingredient', '재료'), ('allergen', '알레르겐')], max_length=20)),
                ('name_raw', models.CharField(max_length=300)),
                ('canonical_tag', models.CharField(blank=True, choices=[('egg', 'egg'), ('milk', 'milk'), ('buckwheat', 'buckwheat'), ('nuts', 'nuts'), ('soy', 'soy'), ('wheat', 'wheat'), ('mackerel', 'mackerel'), ('crab', 'crab'), ('shrimp', 'shrimp'), ('pork', 'pork'), ('peach', 'peach'), ('tomato', 'tomato'), ('sulfites', 'sulfites'), ('chicken', 'chicken'), ('beef', 'beef'), ('squid', 'squid'), ('shellfish', 'shellfish'), ('fish', 'fish'), ('crustacean', 'crustacean'), ('cheese-butter', 'cheese-butter'), ('other-meat', 'other-meat'), ('other-animal', 'other-animal'), ('honey', 'honey'), ('gelatin', 'gelatin')], max_length=50)),
                ('presence', models.CharField(choices=[('present', '포함'), ('absent', '명시적 불포함'), ('unknown', '미확인')], default='unknown', max_length=20)),
                ('verification_status', models.CharField(choices=[('unverified', '미검증'), ('verified', '검토 완료')], default='unverified', max_length=20)),
                ('confirmed_at', models.DateTimeField(blank=True, null=True)),
                ('unknown_scope', models.TextField(blank=True)),
                ('menu', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.PROTECT, related_name='declarations', to='catalog.menu')),
                ('source', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.PROTECT, to='catalog.catalogsource')),
                ('component', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.PROTECT, related_name='declarations', to='catalog.menucomponent')),
            ],
            options={
                'constraints': [models.CheckConstraint(condition=models.Q(models.Q(('component__isnull', True), ('menu__isnull', False)), models.Q(('component__isnull', False), ('menu__isnull', True)), _connector='OR'), name='catalog_declaration_one_target')],
            },
        ),
    ]
