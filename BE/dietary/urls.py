from django.urls import path
from . import views

urlpatterns = [
    path('session', views.session),
    path('allergens', views.allergens),
    path('restricted-ingredients', views.restricted),
    path('dietary-criteria', views.criteria),
    path('profile', views.profile),
    path('judgements', views.judgement),
    path('recommendations/rank', views.ranking),
    path('orders/check', views.order),
    path('communication', views.message),
    path('favorites', views.favorites),
    path('favorites/<int:pk>', views.favorite_detail),
    path('reviews', views.reviews),
    path('reviews/<int:pk>', views.review_detail),
]
