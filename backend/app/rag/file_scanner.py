from __future__ import annotations

import hashlib
import logging
from datetime import datetime
from pathlib import Path
from typing import Iterable, Tuple

from langchain_core.documents import Document
from langchain_text_splitters import RecursiveCharacterTextSplitter

from app.core.settings import get_settings
from .vectorstore import get_vectorstore, delete_by_file_path

logger = logging.getLogger(__name__)

# Adjust this set depending on what your BIG runs actually contain.
# For now: simple text-based formats.
SUPPORTED_EXTS = {".mmd", ".md", ".pdf", ".csv", ".txt", ".markdown", ".json"}


def _hash_file(path: Path) -> str:
    """Return a stable hash of a file's bytes."""
    h = hashlib.md5()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(8192), b""):
            h.update(chunk)
    return h.hexdigest()


def _iter_files(root: Path) -> Iterable[Path]:
    """Yield all files under root, logging what we see."""
    if not root.exists():
        logger.warning(
            "index_dir does not exist: %s (resolved=%s)",
            root,
            root.resolve(),
        )
        return []

    files: list[Path] = []
    for p in root.rglob("*"):
        if p.is_file():
            files.append(p)

    logger.info(
        "Discovered %d filesystem files under index_dir=%s (resolved=%s)",
        len(files),
        root,
        root.resolve(),
    )
    return files


def _load_existing_file_index() -> dict[str, str]:
    """
    Load existing file_path -> file_hash mapping from the vectorstore metadata
    so we can detect new/updated/deleted files.
    """
    vs = get_vectorstore()
    docs = vs.get(include=["metadatas"])
    index: dict[str, str] = {}

    for meta in docs.get("metadatas", []):
        if not meta:
            continue
        fp = meta.get("file_path")
        h = meta.get("file_hash")
        if fp and h:
            index[fp] = h

    logger.info("Loaded %d file hashes from existing vectorstore", len(index))
    return index


def scan_and_build_delta(user_id: str | None = None) -> Tuple[list[Document], int, int, int]:
    """
    Walk INDEX_DIR, compare with what's already in the vectorstore, and build a list
    of new/updated LangChain Documents; also detect deleted files.

    Returns:
        (docs, new_files_count, updated_files_count, deleted_files_count)
    """
    settings = get_settings()
    root = settings.index_dir

    logger.info(
        "Scanning index_dir=%s (resolved=%s) for user_id=%s",
        root,
        root.resolve(),
        user_id,
    )

    existing_index = _load_existing_file_index()
    discovered_files = list(_iter_files(root))

    docs: list[Document] = []
    new_files = 0
    updated_files = 0

    text_splitter = RecursiveCharacterTextSplitter(
        chunk_size=1000,
        chunk_overlap=200,
    )

    supported_files = [p for p in discovered_files if p.suffix.lower() in SUPPORTED_EXTS]
    logger.info(
        "Of %d discovered files, %d have supported extensions: %s",
        len(discovered_files),
        len(supported_files),
        ", ".join(sorted(SUPPORTED_EXTS)),
    )

    for path in supported_files:
        file_path_str = str(path)
        file_hash = _hash_file(path)
        prev_hash = existing_index.get(file_path_str)

        if prev_hash == file_hash:
            # Unchanged file; nothing to do.
            continue

        stat = path.stat()
        created_at = datetime.fromtimestamp(stat.st_ctime).isoformat()
        modified_at = datetime.fromtimestamp(stat.st_mtime).isoformat()

        if prev_hash is None:
            new_files += 1
            logger.debug("New file detected: %s", file_path_str)
        else:
            updated_files += 1
            logger.debug("Updated file detected: %s", file_path_str)
            # Remove old chunks for this file
            delete_by_file_path(file_path_str)

        # Read as text; for binary formats you would need different loaders
        text = path.read_text(encoding="utf-8", errors="ignore")
        base_meta = {
            "file_path": file_path_str,
            "file_name": path.name,
            "file_hash": file_hash,
            "created_at": created_at,
            "modified_at": modified_at,
            "user_id": user_id or "global",
        }

        for idx, chunk in enumerate(text_splitter.split_text(text)):
            meta = dict(base_meta)
            meta["chunk_index"] = idx
            docs.append(Document(page_content=chunk, metadata=meta))

    # Detect deleted files: present in vectorstore index, but not on disk
    current_paths = {str(p) for p in discovered_files}
    deleted_files = 0
    for indexed_path in list(existing_index.keys()):
        if indexed_path not in current_paths:
            logger.debug("Deleted file detected (removing from vectorstore): %s", indexed_path)
            delete_by_file_path(indexed_path)
            deleted_files += 1

    logger.info(
        "Delta scan completed. discovered=%d, supported=%d, new=%d, updated=%d, deleted=%d",
        len(discovered_files),
        len(supported_files),
        new_files,
        updated_files,
        deleted_files,
    )

    return docs, new_files, updated_files, deleted_files
