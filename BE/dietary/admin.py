from django.contrib import admin
from .models import Criterion, SupportRule, Profile, Review

admin.site.register(Criterion)
admin.site.register(SupportRule)


@admin.register(Profile)
class ProfileAdmin(admin.ModelAdmin):
    # Staff status alone never grants personal profile access.
    def has_module_permission(self, request):
        return request.user.has_perm('dietary.view_profile')

    def has_view_permission(self, request, obj=None):
        return request.user.has_perm('dietary.view_profile')


@admin.register(Review)
class ReviewAdmin(admin.ModelAdmin):
    list_display = ['id', 'menu_id', 'created_at']
    readonly_fields = ['profile', 'disclosed_conditions', 'created_at', 'updated_at']

    def has_add_permission(self, request):
        return False
