from django.urls import path

from . import views
from . import extra_views


urlpatterns = [
    path('menu-categories', views.menu_categories, name='menu-category-list'),
    path('restaurants/<str:restaurant_id>/geocode', extra_views.geocode_restaurant, name='restaurant-geocode'),
    path('geocoding/<int:attempt_id>/apply', extra_views.geocode_apply, name='geocode-apply'),
    path('reports', extra_views.reports, name='report-list'),
    path('reports/<int:report_id>', extra_views.report_detail, name='report-detail'),
    path('menus/<str:menu_id>/options/check', extra_views.option_check, name='menu-option-check'),
    path('restaurants/<str:restaurant_id>/menus', views.restaurant_menus, name='restaurant-menu-list'),
    path('menus', views.menus, name='menu-list'),
    path('menus/<str:menu_id>', views.menu_detail, name='menu-detail'),
    path('restaurants', views.restaurants, name='restaurant-list'),
    path('restaurants/<str:restaurant_id>', views.restaurant_detail, name='restaurant-detail'),
]

