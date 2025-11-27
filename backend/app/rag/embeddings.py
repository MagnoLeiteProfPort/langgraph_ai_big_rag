from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol

from langchain_core.embeddings import Embeddings
from langchain_ollama import OllamaEmbeddings
from langchain_openai import OpenAIEmbeddings

from app.core.settings import get_settings


class EmbeddingStrategy(Protocol):
    def as_langchain_embeddings(self) -> Embeddings:
        ...


@dataclass
class OllamaEmbeddingStrategy:
    def as_langchain_embeddings(self) -> Embeddings:
        s = get_settings()
        if not s.ollama_url:
            raise ValueError("OLLAMA_URL is not set but USE_PROVIDER='OLLAMA'.")
        return OllamaEmbeddings(
            model=s.ollama_embedding_model,
            base_url=s.ollama_url,
        )


@dataclass
class OpenAIEmbeddingStrategy:
    def as_langchain_embeddings(self) -> Embeddings:
        s = get_settings()
        if not s.openai_api_key:
            raise ValueError("OPENAI_API_KEY is not set but OpenAI embeddings were requested.")
        return OpenAIEmbeddings(
            model=s.openai_embedding_model,
            api_key=s.openai_api_key,
        )


def get_embedding_strategy() -> Embeddings:
    """
    Returns a LangChain Embeddings object based on USE_PROVIDER.

    Currently supported:
      - OLLAMA  -> OllamaEmbeddings
      - OPENAI  -> OpenAIEmbeddings
      - ANTHROPIC -> Not implemented (raise clear error)
    """
    s = get_settings()
    provider = s.use_provider.upper()

    if provider == "OLLAMA":
        strategy: EmbeddingStrategy = OllamaEmbeddingStrategy()
    elif provider == "OPENAI":
        strategy = OpenAIEmbeddingStrategy()
    elif provider == "ANTHROPIC":
        # You can either:
        #   - implement a custom Anthropics embedding wrapper here, or
        #   - reuse OpenAI embeddings as a fallback.
        # For now we fail loudly to avoid silent misconfigurations.
        raise ValueError(
            "USE_PROVIDER='ANTHROPIC' is not supported for embeddings in this version. "
            "Switch to OLLAMA or OPENAI in .env."
        )
    else:
        raise ValueError(f"Unsupported USE_PROVIDER value: {provider}")

    return strategy.as_langchain_embeddings()
