from django.urls import path
from . import views

urlpatterns = [
    path("", views.home, name="home"),
    path("ideas/", views.home, name="ideas"),
    path("rag/", views.home, name="rag"),
]
