from __future__ import annotations

from pathlib import Path
from typing import Any, Dict, List

import chromadb
from chromadb.config import Settings as ChromaSettings
from langchain_community.vectorstores import Chroma
from langchain_core.documents import Document

from app.core.settings import get_settings
from .embeddings import get_embedding_strategy


def get_chroma_client() -> chromadb.Client:
    settings = get_settings()
    settings.embedding_dir.mkdir(parents=True, exist_ok=True)
    client = chromadb.PersistentClient(
        path=str(settings.embedding_dir),
        settings=ChromaSettings(allow_reset=True),
    )
    return client


def get_vectorstore(collection_name: str = "big_rag") -> Chroma:
    client = get_chroma_client()
    embeddings = get_embedding_strategy()
    return Chroma(
        client=client,
        collection_name=collection_name,
        embedding_function=embeddings,
    )


def upsert_documents(docs: List[Document]) -> None:
    vs = get_vectorstore()
    vs.add_documents(docs)


def delete_by_file_path(file_path: str) -> None:
    vs = get_vectorstore()
    vs.delete(where={"file_path": file_path})


def similarity_search(query: str, k: int = 5, user_id: str | None = None) -> List[Document]:
    vs = get_vectorstore()
    search_kwargs: Dict[str, Any] = {}
    if user_id:
        search_kwargs["filter"] = {"user_id": user_id}
    return vs.similarity_search(query, k=k, **search_kwargs)
