from __future__ import annotations

import logging
from datetime import datetime
from pathlib import Path
from typing import List, Optional

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from app.core.logging_config import configure_logging
from app.core.settings import get_settings
from app.mermaid.diagram import generate_diagram
from app.rag.file_scanner import scan_and_build_delta, _load_text_from_file
from app.rag.vectorstore import upsert_documents, similarity_search
from app.rag.graph import build_graph, RAGState

configure_logging()
logger = logging.getLogger(__name__)

app = FastAPI(title="BIG RAG Service", version="0.1.0")

# Explicit list of allowed frontend origins
origins = [
    "http://localhost:8000",
    "http://127.0.0.1:8000",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=False,  # we don't need cookies for this
    allow_methods=["*"],
    allow_headers=["*"],
)

graph = build_graph()


class EmbedResponse(BaseModel):
    indexed_documents: int
    new_files: int
    updated_files: int
    deleted_files: int


class SearchResult(BaseModel):
    file_name: str
    file_path: str
    score: float
    snippet: str
    created_at: Optional[str] = None
    modified_at: Optional[str] = None


class SearchResponse(BaseModel):
    query: str
    results: List[SearchResult]
    answer: Optional[str] = None


class DocumentContent(BaseModel):
    file_name: str
    file_path: str
    content: str
    created_at: Optional[str] = None
    modified_at: Optional[str] = None


@app.on_event("startup")
async def on_startup() -> None:
    settings = get_settings()
    logger.info("Starting BIG RAG Service with index_dir=%s", settings.index_dir)
    logger.info("Starting BIG RAG Service with use_provider=%s", settings.use_provider)
    logger.info("Starting BIG RAG Service with ollama_url=%s", settings.ollama_url)
    generate_diagram()


@app.post("/rag/embed", response_model=EmbedResponse)
async def embed(user_id: str | None = None) -> EmbedResponse:
    docs, new_files, updated_files, deleted_files = scan_and_build_delta(user_id=user_id)

    if docs:
        upsert_documents(docs)
    else:
        logger.info("No new or updated documents to index.")

    return EmbedResponse(
        indexed_documents=len(docs),
        new_files=new_files,
        updated_files=updated_files,
        deleted_files=deleted_files,
    )


def _validate_query(q: str) -> str:
    q = (q or "").strip()
    if not q:
        raise HTTPException(status_code=400, detail="Query cannot be empty.")

    if len(q) > 1024:
        raise HTTPException(status_code=400, detail="Query is too long.")

    prohibited = ["ignore previous instructions", "delete all data"]
    lowered = q.lower()
    if any(p in lowered for p in prohibited):
        raise HTTPException(status_code=400, detail="Query contains prohibited patterns.")
    return q


@app.get("/rag/search", response_model=SearchResponse)
async def search(
    q: str = Query(..., description="Free text query"),
    user_id: str | None = None,
    with_answer: bool = True,
) -> SearchResponse:
    query = _validate_query(q)

    docs = similarity_search(query, k=5, user_id=user_id)
    results: list[SearchResult] = []
    for d in docs:
        meta = d.metadata or {}
        snippet = d.page_content[:300].replace("\n", " ")
        results.append(
            SearchResult(
                file_name=meta.get("file_name", "unknown"),
                file_path=meta.get("file_path", ""),
                score=float(meta.get("score", 0.0)) if "score" in meta else 0.0,
                snippet=snippet + ("..." if len(d.page_content) > 300 else ""),
                created_at=meta.get("created_at"),
                modified_at=meta.get("modified_at"),
            )
        )

    answer: str | None = None
    if with_answer and docs:
        state = RAGState(question=query, user_id=user_id)
        final_state = graph.invoke(state)

        # LangGraph returns a dict-like state
        if isinstance(final_state, dict):
            answer = final_state.get("answer")
        else:
            answer = getattr(final_state, "answer", None)

    return SearchResponse(query=query, results=results, answer=answer)


@app.get("/rag/document", response_model=DocumentContent)
async def get_document(file_path: str, user_id: str | None = None) -> DocumentContent:
    """
    Return the full content of a document given its file_path metadata.

    This reads directly from the filesystem using the same loaders as the
    embedding pipeline (including PDF support). It also validates that the
    requested path is under INDEX_DIR to avoid path traversal.
    """
    settings = get_settings()
    root = Path(settings.index_dir).resolve()
    requested = Path(file_path).resolve()

    # Security: ensure the requested path lives under index_dir
    if not str(requested).startswith(str(root)):
        logger.warning(
            "Rejected document request outside index_dir. requested=%s, root=%s",
            requested,
            root,
        )
        raise HTTPException(status_code=400, detail="Invalid file path.")

    if not requested.exists():
        raise HTTPException(status_code=404, detail="Document not found.")

    try:
        content = _load_text_from_file(requested)
    except Exception as e:
        logger.exception("Failed to load document content for %s", requested)
        raise HTTPException(status_code=500, detail=f"Failed to load document: {e}")

    stat = requested.stat()
    created_at = datetime.fromtimestamp(stat.st_ctime).isoformat()
    modified_at = datetime.fromtimestamp(stat.st_mtime).isoformat()

    return DocumentContent(
        file_name=requested.name,
        file_path=str(requested),
        content=content,
        created_at=created_at,
        modified_at=modified_at,
    )
