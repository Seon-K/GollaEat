from django.db import migrations


def seed(apps, schema_editor):
    Criterion = apps.get_model('dietary', 'Criterion')
    Rule = apps.get_model('dietary', 'SupportRule')
    allergens = [
        ('egg', '난류'), ('milk', '우유'), ('buckwheat', '메밀'), ('nuts', '견과류'),
        ('soy', '대두'), ('wheat', '밀'), ('mackerel', '고등어'), ('crab', '게'),
        ('shrimp', '새우'), ('pork', '돼지고기'), ('peach', '복숭아'), ('tomato', '토마토'),
        ('sulfites', '아황산류'), ('chicken', '닭고기'), ('beef', '쇠고기'), ('squid', '오징어'), ('shellfish', '조개류'),
    ]
    # 초기 성분 태그 기준, 견과류 그룹에 땅콩 포함
    for tag, name in allergens:
        c = Criterion.objects.create(code='allergen-' + tag, name=name, kind='allergen')
        Rule.objects.create(criterion=c, excluded_tags=[tag], source='GollaEat 성분 태그 계약 v1: ' + tag)
    groups = {
        '육류': [('beef', '소고기'), ('pork', '돼지고기'), ('chicken', '닭고기'), ('other-meat', '기타 육류')],
        '해산물': [('fish', '생선'), ('crustacean', '갑각류'), ('shellfish', '조개류')],
        '달걀·유제품': [('egg', '달걀'), ('milk', '우유'), ('cheese-butter', '치즈·버터')],
        '기타 동물성 재료': [('honey', '꿀'), ('gelatin', '젤라틴')],
    }
    for category, items in groups.items():
        for tag, name in items:
            c = Criterion.objects.create(code='exclude-' + tag, name=name, kind='ingredient', category=category)
            Rule.objects.create(criterion=c, excluded_tags=[tag], source='GollaEat 성분 태그 계약 v1: ' + tag)
    for code, name, tags in [
        ('vegan', '비건', ['beef', 'pork', 'chicken', 'other-meat', 'fish', 'crustacean', 'shellfish', 'egg', 'milk', 'cheese-butter', 'honey', 'gelatin', 'other-animal']),
        ('vegetarian', '락토오보 채식', ['beef', 'pork', 'chicken', 'other-meat', 'fish', 'crustacean', 'shellfish', 'gelatin', 'other-animal'])]:
        c = Criterion.objects.create(code=code, name=name, kind='diet')
        Rule.objects.create(criterion=c, excluded_tags=tags, source='GollaEat 식이 범위 v1 (성분 기준, 인증 아님)')
    for code, name in [('korean', '한식'), ('western', '양식'), ('japanese', '일식'), ('chinese', '중식'), ('spicy', '매운 음식')]:
        Criterion.objects.create(code='prefer-' + code, name=name, kind='preference')


class Migration(migrations.Migration):
    dependencies = [('dietary', '0001_initial')]
    operations = [migrations.RunPython(seed, migrations.RunPython.noop)]
