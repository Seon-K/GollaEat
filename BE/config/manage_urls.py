from django.urls import path
from . import manage_views as views

urlpatterns = [
    path('session', views.session),
    path('login', views.sign_in),
    path('logout', views.sign_out),
    path('dashboard', views.dashboard),
    path('<str:resource>', views.records),
    path('<str:resource>/<str:pk>', views.records),
]
