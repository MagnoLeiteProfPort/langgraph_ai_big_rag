from __future__ import annotations

import logging
from pathlib import Path

from app.core.settings import get_settings

logger = logging.getLogger(__name__)


MERMAID_CONTENT = """graph TD
    A[User in React/Django UI] --> B[FastAPI /rag/search]
    A --> C[FastAPI /rag/embed]
    C --> D[File Scanner]
    D --> E[LangChain Text Splitter]
    E --> F[Vector DB - Chroma + SQLite]
    B --> G[LangGraph Orchestrator]
    G --> H[Retriever Node]
    H --> F
    F --> H
    H --> I[Generator Node]
    I --> J[LLM (Ollama/OpenAI/Anthropic)]
    J --> G
    G --> K[JSON Response to UI]
"""


def generate_diagram() -> None:
    """
    Generate only the Mermaid .mmd diagram file.

    PNG rendering is intentionally NOT done here because mermaid-cli (mmdc)
    can be fragile on Windows when the user profile path contains parentheses
    or spaces. If you want a PNG, run mmdc manually from the command line.
    """
    settings = get_settings()
    diagrams_dir = settings.embedding_dir.parent / "diagrams"
    diagrams_dir.mkdir(parents=True, exist_ok=True)

    mmd_path = diagrams_dir / "agent_architecture.mmd"
    mmd_path.write_text(MERMAID_CONTENT, encoding="utf-8")
    logger.info("Mermaid diagram written to %s", mmd_path)

    # Just info, no warnings, no subprocess:
    logger.info(
        "To render a PNG manually (optional), run something like:\n"
        "  mmdc -i \"%s\" -o \"%s\"\n"
        "from a terminal where mmdc is on PATH.",
        mmd_path,
        diagrams_dir / "agent_architecture.png",
    )
