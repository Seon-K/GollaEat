import math
import uuid

from django.conf import settings
from django.core.exceptions import ValidationError
from django.core.validators import MinValueValidator, MaxValueValidator
from django.db import models


class Restaurant(models.Model):
    place_id = models.CharField(max_length=100, primary_key=True)
    name = models.CharField(max_length=500)
    data = models.JSONField(default=dict, blank=True)
    address = models.TextField(blank=True, default='')
    phone = models.CharField(max_length=100, blank=True, default='')
    brand = models.CharField(max_length=200, blank=True, default='')
    category = models.CharField(max_length=100, blank=True, default='')
    restaurant_type = models.CharField(max_length=30, blank=True, default='')
    latitude = models.FloatField(null=True, blank=True, validators=[MinValueValidator(-90), MaxValueValidator(90)])
    longitude = models.FloatField(null=True, blank=True, validators=[MinValueValidator(-180), MaxValueValidator(180)])
    takeaway = models.BooleanField(null=True, blank=True)
    delivery = models.BooleanField(null=True, blank=True)
    reservation_url = models.URLField(max_length=1000, blank=True)
    directions_url = models.URLField(max_length=1000, blank=True)
    hours_confirmed_at = models.DateTimeField(null=True, blank=True)
    hours_source = models.ForeignKey('CatalogSource', null=True, blank=True, on_delete=models.PROTECT)

    def clean(self):
        if (self.latitude is None) != (self.longitude is None):
            raise ValidationError('위도와 경도는 함께 입력해야 합니다.')
        for value in (self.latitude, self.longitude):
            if value is not None and not math.isfinite(value):
                raise ValidationError('좌표는 유한한 숫자여야 합니다.')

    def __str__(self):
        return self.name


class Menu(models.Model):
    preprocess_row_id = models.CharField(max_length=100, primary_key=True)
    restaurant = models.ForeignKey(Restaurant, on_delete=models.PROTECT, related_name='menus')
    name = models.CharField(max_length=500)
    price_amount = models.BigIntegerField(null=True, blank=True, db_index=True)
    data = models.JSONField(default=dict, blank=True)
    category = models.CharField(max_length=100, blank=True, default='')
    description = models.TextField(blank=True, default='')
    sale_status = models.CharField(max_length=20, default='unverified', choices=[
        ('unverified', '미확인'), ('available', '판매 확인'), ('unavailable', '판매 중지 확인')])

    def clean(self):
        if self.pk and self.pk.startswith('component:'):
            raise ValidationError('메뉴 ID에 구성품 전용 접두사를 사용할 수 없습니다.')
        if self.price_amount is not None and self.price_amount < 0:
            raise ValidationError('가격은 0 이상이어야 합니다.')

    def __str__(self):
        return self.name


class CatalogSource(models.Model):
    title = models.CharField(max_length=300)
    url = models.URLField(max_length=1000, blank=True)
    evidence_locator = models.CharField(max_length=1000, blank=True)
    source_type = models.CharField(max_length=30, choices=[('official', '공식'), ('store', '매장 확인'),
        ('user', '이용자'), ('reference', '일반 참고')], default='reference')
    checked_at = models.DateTimeField(null=True, blank=True)
    valid_until = models.DateTimeField(null=True, blank=True)
    notes = models.TextField(blank=True)

    def clean(self):
        if self.valid_until and self.checked_at and self.valid_until < self.checked_at:
            raise ValidationError('만료일은 확인일 이후여야 합니다.')

    def __str__(self):
        return self.title


class BusinessHours(models.Model):
    restaurant = models.ForeignKey(Restaurant, on_delete=models.CASCADE, related_name='business_hours')
    weekday = models.PositiveSmallIntegerField(validators=[MaxValueValidator(6)], help_text='월요일 0 ~ 일요일 6')
    is_closed = models.BooleanField(default=False)
    opens_at = models.TimeField(null=True, blank=True)
    closes_at = models.TimeField(null=True, blank=True)
    closes_next_day = models.BooleanField(default=False)
    break_start = models.TimeField(null=True, blank=True)
    break_end = models.TimeField(null=True, blank=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=['restaurant', 'weekday'], name='catalog_unique_weekday')]

    def clean(self):
        if self.is_closed:
            if any((self.opens_at, self.closes_at, self.break_start, self.break_end)):
                raise ValidationError('휴무일에는 시간을 입력하지 마세요.')
            return
        if self.opens_at is None or self.closes_at is None:
            raise ValidationError('영업 시작·종료 시간이 필요합니다.')
        def minutes(t):
            return t.hour * 60 + t.minute + t.second / 60
        start = minutes(self.opens_at)
        end = minutes(self.closes_at) + (1440 if self.closes_next_day else 0)
        if not start < end <= start + 1440:
            raise ValidationError('영업시간 범위가 잘못되었습니다.')
        if (self.break_start is None) != (self.break_end is None):
            raise ValidationError('브레이크타임 시작·종료를 함께 입력하세요.')
        if self.break_start is not None:
            bs, be = minutes(self.break_start), minutes(self.break_end)
            if bs < start:
                bs += 1440
            if be <= bs:
                be += 1440
            if not start <= bs < be <= end:
                raise ValidationError('브레이크타임은 영업시간 내에 있어야 합니다.')


class Closure(models.Model):
    restaurant = models.ForeignKey(Restaurant, on_delete=models.CASCADE, related_name='closures')
    date = models.DateField()
    reason = models.CharField(max_length=300, blank=True)
    source = models.ForeignKey(CatalogSource, null=True, blank=True, on_delete=models.PROTECT)

    class Meta:
        constraints = [models.UniqueConstraint(fields=['restaurant', 'date'], name='catalog_unique_closure')]


class OptionGroup(models.Model):
    menu = models.ForeignKey(Menu, on_delete=models.PROTECT, related_name='option_groups')
    name = models.CharField(max_length=200)
    min_select = models.PositiveSmallIntegerField(default=0)
    max_select = models.PositiveSmallIntegerField(default=1)
    source = models.ForeignKey(CatalogSource, null=True, blank=True, on_delete=models.PROTECT)

    def clean(self):
        if self.min_select > self.max_select or self.max_select < 1:
            raise ValidationError('선택 최소·최대 개수를 확인하세요.')

    def __str__(self):
        return self.name


class MenuComponent(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    menu = models.ForeignKey(Menu, on_delete=models.PROTECT, related_name='components')
    group = models.ForeignKey(OptionGroup, null=True, blank=True, on_delete=models.PROTECT, related_name='components')
    name = models.CharField(max_length=200)
    role = models.CharField(max_length=20, choices=[('sauce', '소스'), ('topping', '토핑'),
        ('side', '사이드'), ('drink', '음료'), ('menu', '구성 메뉴')])
    extra_price = models.BigIntegerField(null=True, blank=True, validators=[MinValueValidator(0)])
    is_default = models.BooleanField(default=False)
    instructions = models.TextField(blank=True)
    source = models.ForeignKey(CatalogSource, null=True, blank=True, on_delete=models.PROTECT)

    def clean(self):
        if self.group_id and self.group.menu_id != self.menu_id:
            raise ValidationError('옵션 그룹과 구성품의 메뉴가 다릅니다.')

    def __str__(self):
        return self.name


# Exact tags shared with B; aggregate absence must be explicitly declared for that tag.
CANONICAL_TAGS = ('egg', 'milk', 'buckwheat', 'nuts', 'soy', 'wheat', 'mackerel', 'crab',
    'shrimp', 'pork', 'peach', 'tomato', 'sulfites', 'chicken', 'beef', 'squid', 'shellfish',
    'fish', 'crustacean', 'cheese-butter', 'other-meat', 'other-animal', 'honey', 'gelatin')


class FoodDeclaration(models.Model):
    menu = models.ForeignKey(Menu, null=True, blank=True, on_delete=models.PROTECT, related_name='declarations')
    component = models.ForeignKey(MenuComponent, null=True, blank=True, on_delete=models.PROTECT, related_name='declarations')
    kind = models.CharField(max_length=20, choices=[('ingredient', '재료'), ('allergen', '알레르겐')])
    name_raw = models.CharField(max_length=300)
    canonical_tag = models.CharField(max_length=50, blank=True, choices=[(t, t) for t in CANONICAL_TAGS])
    presence = models.CharField(max_length=20, default='unknown', choices=[
        ('present', '포함'), ('absent', '명시적 불포함'), ('unknown', '미확인')])
    verification_status = models.CharField(max_length=20, default='unverified', choices=[
        ('unverified', '미검증'), ('verified', '검토 완료')])
    source = models.ForeignKey(CatalogSource, null=True, blank=True, on_delete=models.PROTECT)
    confirmed_at = models.DateTimeField(null=True, blank=True)
    unknown_scope = models.TextField(blank=True)
    applicability_scope = models.CharField(max_length=100, blank=True, help_text='메뉴/구성품/브랜드 참고 등 원문 적용 범위')
    import_link = models.ForeignKey('AllergenLink', null=True, blank=True, on_delete=models.PROTECT, related_name='declarations')

    class Meta:
        constraints = [models.CheckConstraint(condition=(
            models.Q(menu__isnull=False, component__isnull=True) |
            models.Q(menu__isnull=True, component__isnull=False)), name='catalog_declaration_one_target'),
            models.UniqueConstraint(fields=['import_link', 'canonical_tag'], name='catalog_unique_import_tag')]

    def clean(self):
        if bool(self.menu_id) == bool(self.component_id):
            raise ValidationError('메뉴 또는 구성품 하나만 지정하세요.')
        if self.verification_status == 'verified' and not (self.source_id and self.confirmed_at):
            raise ValidationError('검증 정보에는 출처와 확인일이 필요합니다.')
        if self.import_link_id and self.import_link.menu_id != self.menu_id:
            raise ValidationError('매핑 정보와 성분의 메뉴가 다릅니다.')


class AllergenLink(models.Model):
    menu = models.OneToOneField(Menu, on_delete=models.PROTECT, related_name='allergen_link')
    external_menu_id = models.CharField(max_length=100)
    brand = models.CharField(max_length=200)
    match_method = models.CharField(max_length=100, default='place_id_brand_exact_menu')
    status = models.CharField(max_length=30, choices=[('reference', '참고'),
        ('verified_source', '검토된 출처의 포함 정보'), ('inactive', '재확인 필요')], default='reference')
    source = models.ForeignKey(CatalogSource, on_delete=models.PROTECT)
    payload = models.JSONField(default=dict, blank=True)
    updated_at = models.DateTimeField(auto_now=True)


class InformationReport(models.Model):
    restaurant = models.ForeignKey(Restaurant, null=True, blank=True, on_delete=models.PROTECT)
    menu = models.ForeignKey(Menu, null=True, blank=True, on_delete=models.PROTECT)
    owner_token = models.UUIDField(default=uuid.uuid4, editable=False)
    user = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL)
    category = models.CharField(max_length=30, choices=[('menu_price', '메뉴·가격'),
        ('ingredients_allergens', '재료·알레르겐'), ('business', '영업정보'), ('other', '기타')])
    content = models.TextField(max_length=5000)
    proposed_changes = models.JSONField(default=dict, blank=True)
    status = models.CharField(max_length=20, default='pending', choices=[('pending', '접수'),
        ('reviewing', '검토 중'), ('resolved', '반영 완료'), ('rejected', '반려')])
    review_notes = models.TextField(blank=True)
    reviewed_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True,
        on_delete=models.SET_NULL, related_name='+')
    created_at = models.DateTimeField(auto_now_add=True)
    reviewed_at = models.DateTimeField(null=True, blank=True)

    def clean(self):
        if not self.restaurant_id and not self.menu_id:
            raise ValidationError('매장 또는 메뉴가 필요합니다.')
        if self.restaurant_id and self.menu_id and self.menu.restaurant_id != self.restaurant_id:
            raise ValidationError('매장과 메뉴가 일치하지 않습니다.')
        if not isinstance(self.proposed_changes, dict):
            raise ValidationError('수정 제안은 객체여야 합니다.')


class ReportEvent(models.Model):
    report = models.ForeignKey(InformationReport, on_delete=models.PROTECT, related_name='events')
    action = models.CharField(max_length=30)
    reviewer = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, on_delete=models.SET_NULL)
    before = models.JSONField(default=dict, blank=True)
    after = models.JSONField(default=dict, blank=True)
    notes = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)


class GeocodeAttempt(models.Model):
    restaurant = models.ForeignKey(Restaurant, on_delete=models.PROTECT, related_name='geocode_attempts')
    provider = models.CharField(max_length=200)
    mode = models.CharField(max_length=20, choices=[('address', '주소'), ('place', '장소명')])
    query_address = models.TextField(blank=True)
    query_place_name = models.CharField(max_length=500, blank=True)
    existing_latitude = models.FloatField(null=True, blank=True)
    existing_longitude = models.FloatField(null=True, blank=True)
    status = models.CharField(max_length=30, choices=[(value, value) for value in (
        'not_configured', 'error', 'not_found', 'ambiguous', 'conflict', 'unchanged', 'proposed', 'applied_unverified')])
    candidates = models.JSONField(default=list, blank=True)
    requested_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name='+')
    applied_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name='+')
    created_at = models.DateTimeField(auto_now_add=True)
    applied_at = models.DateTimeField(null=True, blank=True)


class MenuAnalysisReference(models.Model):
    """Unverified display information only; never a dietary declaration."""
    menu = models.OneToOneField(Menu, primary_key=True, on_delete=models.PROTECT, related_name='analysis_reference')
    explicit_ingredients = models.JSONField(default=list, blank=True)
    explicit_components = models.JSONField(default=list, blank=True)
    gemini_estimated_ingredients = models.JSONField(default=list, blank=True)
    ingredient_source = models.CharField(max_length=40)
    evidence_level = models.CharField(max_length=40)
    information_status = models.CharField(max_length=40)
    gemini_status = models.CharField(max_length=100, blank=True)
    public_food_code = models.TextField(blank=True)
    public_food_name = models.TextField(blank=True)
    public_allergens = models.TextField(blank=True)
    public_allergy_raw = models.TextField(blank=True)
    public_reference_status = models.CharField(max_length=50, default='UNVERIFIED_SIMILAR_FOOD')
    restaurant_ingredient_verification = models.CharField(max_length=50, default='NOT_VERIFIED')
    allergy_safety_status = models.CharField(max_length=50, default='UNKNOWN_NOT_VERIFIED')
    payload = models.JSONField(default=dict, blank=True)
    source_filename = models.CharField(max_length=255)
    source_sha256 = models.CharField(max_length=64)
    imported_at = models.DateTimeField(auto_now=True)
