from django.contrib import admin, messages
from django.core.exceptions import ValidationError, PermissionDenied
from django.utils import timezone

from .models import (Restaurant, Menu, BusinessHours, Closure, OptionGroup, MenuComponent,
                     CatalogSource, FoodDeclaration, InformationReport, AllergenLink, ReportEvent, GeocodeAttempt,
                     MenuAnalysisReference)
from .operations import apply_report, review_report


class HoursInline(admin.TabularInline):
    model = BusinessHours
    extra = 0


class ClosureInline(admin.TabularInline):
    model = Closure
    extra = 0


@admin.register(Restaurant)
class RestaurantAdmin(admin.ModelAdmin):
    list_display = ['place_id', 'name', 'brand', 'category', 'hours_confirmed_at']
    search_fields = ['place_id', 'name', 'address', 'brand']
    list_filter = ['restaurant_type', 'category']
    inlines = [HoursInline, ClosureInline]
    readonly_fields = ['data']
    actions = ['geocode_address', 'geocode_place']

    @admin.action(description='주소로 좌표 후보 조회 (1개 매장)', permissions=['change'])
    def geocode_address(self, request, queryset):
        self._geocode(request, queryset, 'address')

    @admin.action(description='장소명으로 좌표 후보 조회 (1개 매장)', permissions=['change'])
    def geocode_place(self, request, queryset):
        self._geocode(request, queryset, 'place')

    def _geocode(self, request, queryset, mode):
        from .geocoding import propose_coordinates
        if queryset.count() != 1:
            self.message_user(request, '매장 한 곳을 선택하세요.', level=messages.ERROR)
            return
        try:
            attempt = propose_coordinates(queryset.get(), request.user, mode)
            self.message_user(request, f'좌표 변환 기록 {attempt.pk}: {attempt.status}')
        except (ValidationError, PermissionDenied) as exc:
            self.message_user(request, str(exc), level=messages.ERROR)

    def get_readonly_fields(self, request, obj=None):
        return [*self.readonly_fields, *(['place_id'] if obj else [])]

    def has_delete_permission(self, request, obj=None):
        return False


class GroupInline(admin.TabularInline):
    model = OptionGroup
    extra = 0


@admin.register(Menu)
class MenuAdmin(admin.ModelAdmin):
    list_display = ['preprocess_row_id', 'name', 'restaurant', 'price_amount', 'sale_status']
    search_fields = ['preprocess_row_id', 'name', 'restaurant__name']
    list_filter = ['sale_status', 'category']
    autocomplete_fields = ['restaurant']
    readonly_fields = ['data']
    inlines = [GroupInline]

    def get_readonly_fields(self, request, obj=None):
        return [*self.readonly_fields, *(['preprocess_row_id', 'restaurant'] if obj else [])]

    def has_delete_permission(self, request, obj=None):
        return False


@admin.register(MenuComponent)
class ComponentAdmin(admin.ModelAdmin):
    list_display = ['name', 'menu', 'role', 'group', 'is_default']
    search_fields = ['name', 'menu__name']
    autocomplete_fields = ['menu']
    readonly_fields = ['id']


@admin.register(OptionGroup)
class GroupAdmin(admin.ModelAdmin):
    list_display = ['name', 'menu', 'min_select', 'max_select']
    autocomplete_fields = ['menu']
    search_fields = ['name', 'menu__name']


@admin.register(CatalogSource)
class SourceAdmin(admin.ModelAdmin):
    list_display = ['title', 'source_type', 'checked_at', 'valid_until']
    search_fields = ['title', 'url']
    list_filter = ['source_type']


@admin.register(FoodDeclaration)
class DeclarationAdmin(admin.ModelAdmin):
    list_display = ['name_raw', 'canonical_tag', 'presence', 'verification_status', 'menu', 'component']
    list_filter = ['kind', 'verification_status', 'presence']
    search_fields = ['name_raw', 'canonical_tag', 'menu__name']
    autocomplete_fields = ['menu', 'component', 'source']
    readonly_fields = ['import_link']


@admin.register(AllergenLink)
class AllergenLinkAdmin(admin.ModelAdmin):
    list_display = ['menu', 'brand', 'external_menu_id', 'status', 'updated_at']
    list_filter = ['status', 'brand']
    search_fields = ['menu__name', 'external_menu_id', 'brand']
    readonly_fields = ['menu', 'brand', 'external_menu_id', 'match_method', 'status', 'source', 'payload', 'updated_at']

    def has_add_permission(self, request):
        return False

    def has_delete_permission(self, request, obj=None):
        return False


@admin.register(ReportEvent)
class ReportEventAdmin(admin.ModelAdmin):
    list_display = ['report', 'action', 'reviewer', 'created_at']
    readonly_fields = ['report', 'action', 'reviewer', 'before', 'after', 'notes', 'created_at']

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False


@admin.register(GeocodeAttempt)
class GeocodeAttemptAdmin(admin.ModelAdmin):
    list_display = ['id', 'restaurant', 'provider', 'mode', 'status', 'created_at']
    list_filter = ['provider', 'status']
    readonly_fields = ['restaurant', 'provider', 'mode', 'query_address', 'query_place_name',
        'existing_latitude', 'existing_longitude', 'status', 'candidates', 'requested_by',
        'applied_by', 'created_at', 'applied_at']
    actions = ['apply_proposal']

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False

    def has_apply_permission(self, request):
        return request.user.has_perm('catalog.change_restaurant') and self.has_view_permission(request)

    @admin.action(description='빈 좌표에 단일 후보 적용 (미검증 유지)', permissions=['apply'])
    def apply_proposal(self, request, queryset):
        from .geocoding import apply_coordinates
        for attempt in queryset:
            try:
                apply_coordinates(attempt.pk, request.user)
            except (ValidationError, PermissionDenied) as exc:
                self.message_user(request, f'좌표 변환 기록 {attempt.pk}: {exc}', level=messages.ERROR)


@admin.register(MenuAnalysisReference)
class AnalysisReferenceAdmin(admin.ModelAdmin):
    list_display = ['menu', 'ingredient_source', 'evidence_level', 'gemini_status', 'imported_at']
    list_filter = ['ingredient_source', 'evidence_level']
    search_fields = ['menu__preprocess_row_id', 'menu__name', 'menu__restaurant__name']
    readonly_fields = [field.name for field in MenuAnalysisReference._meta.fields]

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False


@admin.register(InformationReport)
class ReportAdmin(admin.ModelAdmin):
    list_display = ['id', 'category', 'status', 'menu', 'restaurant', 'created_at']
    list_filter = ['status', 'category']
    readonly_fields = ['restaurant', 'menu', 'owner_token', 'user', 'category', 'content',
        'proposed_changes', 'status', 'reviewed_by', 'created_at', 'reviewed_at']
    actions = ['start_review', 'reject', 'apply_changes', 'resolve_manual']

    def has_add_permission(self, request):
        return False

    @admin.action(description='검토 시작', permissions=['change'])
    def start_review(self, request, queryset):
        self._transition(request, queryset, 'review')

    @admin.action(description='검토 기록이 있는 제보 반려', permissions=['change'])
    def reject(self, request, queryset):
        self._transition(request, queryset, 'reject')

    @admin.action(description='검토한 수정 제안 원본 반영', permissions=['change'])
    def apply_changes(self, request, queryset):
        for report in queryset:
            try:
                apply_report(report.pk, request.user)
            except (ValidationError, PermissionDenied) as exc:
                self.message_user(request, f'제보 {report.pk}: {exc}', level=messages.ERROR)

    @admin.action(description='원본 수동 수정 후 반영 완료 기록', permissions=['change'])
    def resolve_manual(self, request, queryset):
        self._transition(request, queryset, 'resolve_manual')

    def _transition(self, request, queryset, action):
        for report in queryset:
            try:
                review_report(report.pk, request.user, action)
            except (ValidationError, PermissionDenied) as exc:
                self.message_user(request, f'제보 {report.pk}: {exc}', level=messages.ERROR)
