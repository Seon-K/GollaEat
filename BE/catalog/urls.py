from django.urls import path

from . import views


urlpatterns = [
    path('restaurants/<str:restaurant_id>/menus', views.restaurant_menus, name='restaurant-menu-list'),
    path('menus', views.menus, name='menu-list'),
    path('menus/<str:menu_id>', views.menu_detail, name='menu-detail'),
    path('restaurants', views.restaurants, name='restaurant-list'),
    path('restaurants/<str:restaurant_id>', views.restaurant_detail, name='restaurant-detail'),
]

