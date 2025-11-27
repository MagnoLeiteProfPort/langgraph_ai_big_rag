from django.shortcuts import render
from django.conf import settings


def home(request):
    return render(request, "index.html", {"rag_api_base": settings.RAG_API_BASE})
