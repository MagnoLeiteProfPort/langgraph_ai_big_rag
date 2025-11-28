from __future__ import annotations

import logging
from datetime import datetime
from pathlib import Path
from typing import List, Optional, Tuple

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


class DocumentUpdate(BaseModel):
    file_path: str
    content: str
    user_id: Optional[str] = None


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


# ---------- Simple versioning helpers (local to this file) ----------

def _parse_version(path: Path) -> Tuple[str, int]:
    """
    Parse filenames like:
      base.ext
      base__v1.ext
      base__v2.ext
    Returns (base, version_int).
    """
    stem = path.stem
    if "__v" in stem:
        base, vpart = stem.rsplit("__v", 1)
        if vpart.isdigit():
            return base, int(vpart)
    return stem, 0


def _resolve_latest_version(path: Path) -> Path:
    """
    Given a path (original or versioned), find the highest version sibling.
    If no versions exist, return the original path.
    """
    base, _ = _parse_version(path)
    suffix = path.suffix
    parent = path.parent

    best_version = -1
    best_path: Path | None = None

    try:
        for p in parent.iterdir():
            if not p.is_file() or p.suffix != suffix:
                continue
            b, v = _parse_version(p)
            if b == base and v > best_version:
                best_version = v
                best_path = p
    except FileNotFoundError:
        # Parent folder might not exist
        pass

    return best_path or path


def _next_version_path(path: Path) -> Path:
    """
    Given any path:
      - Find the latest existing version among siblings
      - Return a new path with version incremented.
    """
    latest = _resolve_latest_version(path)
    base, v = _parse_version(latest)
    next_v = v + 1
    return latest.parent / f"{base}__v{next_v}{latest.suffix}"


# -------------------------------------------------------------------


@app.get("/rag/document", response_model=DocumentContent)
async def get_document(file_path: str, user_id: str | None = None) -> DocumentContent:
    """
    Return the full content of a document given its file_path metadata.

    Always resolves to the latest version of the file (base, base__v1, base__v2, ...).
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

    latest = _resolve_latest_version(requested)

    if not latest.exists():
        raise HTTPException(status_code=404, detail="Document not found.")

    try:
        content = _load_text_from_file(latest)
    except Exception as e:
        logger.exception("Failed to load document content for %s", latest)
        raise HTTPException(status_code=500, detail=f"Failed to load document: {e}")

    stat = latest.stat()
    created_at = datetime.fromtimestamp(stat.st_ctime).isoformat()
    modified_at = datetime.fromtimestamp(stat.st_mtime).isoformat()

    return DocumentContent(
        file_name=latest.name,
        file_path=str(latest),
        content=content,
        created_at=created_at,
        modified_at=modified_at,
    )


@app.post("/rag/document/save", response_model=DocumentContent)
async def save_document(update: DocumentUpdate) -> DocumentContent:
    """
    Save an edited document as a new version.

    - Given file_path = original or any version
    - Find latest version among siblings
    - Create next version file (base__vN.ext)
    - Write new content there
    - Return that version as DocumentContent

    The RAG embeddings will pick it up on the next /rag/embed run via the delta mechanism.
    """
    settings = get_settings()
    root = Path(settings.index_dir).resolve()
    requested = Path(update.file_path).resolve()

    # Security: ensure the requested path lives under index_dir
    if not str(requested).startswith(str(root)):
        logger.warning(
            "Rejected document save outside index_dir. requested=%s, root=%s",
            requested,
            root,
        )
        raise HTTPException(status_code=400, detail="Invalid file path.")

    next_path = _next_version_path(requested)
    next_path.parent.mkdir(parents=True, exist_ok=True)

    try:
        next_path.write_text(update.content, encoding="utf-8")
    except Exception as e:
        logger.exception("Failed to write document version for %s", next_path)
        raise HTTPException(status_code=500, detail=f"Failed to save document: {e}")

    stat = next_path.stat()
    created_at = datetime.fromtimestamp(stat.st_ctime).isoformat()
    modified_at = datetime.fromtimestamp(stat.st_mtime).isoformat()

    logger.info("Saved new document version: %s", next_path)

    return DocumentContent(
        file_name=next_path.name,
        file_path=str(next_path),
        content=update.content,
        created_at=created_at,
        modified_at=modified_at,
    )
