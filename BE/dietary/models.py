import uuid

from django.core.exceptions import ValidationError
from django.db import models


class Criterion(models.Model):
    class Kind(models.TextChoices):
        ALLERGEN = 'allergen', '알레르겐'
        INGREDIENT = 'ingredient', '제외 재료'
        DIET = 'diet', '식이 유형'
        PREFERENCE = 'preference', '음식 선호'

    code = models.SlugField(unique=True)
    name = models.CharField(max_length=80)
    kind = models.CharField(max_length=20, choices=Kind.choices)
    category = models.CharField(max_length=80, blank=True)
    active = models.BooleanField(default=True)

    def __str__(self):
        return self.name


class SupportRule(models.Model):
    criterion = models.OneToOneField(Criterion, on_delete=models.CASCADE, related_name='rule')
    # A의 명시적 성분 정보 기반 제한 태그 검증
    excluded_tags = models.JSONField(default=list)
    source = models.CharField(max_length=500)
    enabled = models.BooleanField(default=True)

    def clean(self):
        if not isinstance(self.excluded_tags, list) or not self.excluded_tags or any(
            not isinstance(tag, str) or not tag.strip() for tag in self.excluded_tags
        ):
            raise ValidationError({'excluded_tags': '하나 이상의 성분 태그 문자열이 필요합니다.'})
        if self.criterion_id and self.criterion.kind == 'preference':
            raise ValidationError('음식 선호에는 섭취 제한 규칙을 설정할 수 없습니다.')


class Profile(models.Model):
    # 서버 세션 UUID 기반 비회원 소유권
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    guest_id = models.UUIDField(unique=True, editable=False)
    criteria = models.ManyToManyField(Criterion, blank=True)
    updated_at = models.DateTimeField(auto_now=True)

class Favorite(models.Model):
    profile = models.ForeignKey(Profile, on_delete=models.CASCADE)
    menu_id = models.CharField(max_length=100)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=['profile', 'menu_id'], name='unique_favorite')]


class Review(models.Model):
    profile = models.ForeignKey(Profile, on_delete=models.CASCADE)
    menu_id = models.CharField(max_length=100)
    body = models.TextField(max_length=5000)
    # 작성 당시 공개 동의 조건 스냅샷
    disclosed_conditions = models.JSONField(default=list)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
