from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Dict, Any

from langgraph.graph import StateGraph, END
from langchain_core.language_models import BaseChatModel
from langchain_openai import ChatOpenAI
from langchain_ollama import ChatOllama
from langchain_anthropic import ChatAnthropic

from app.core.settings import get_settings
from .vectorstore import similarity_search

logger = logging.getLogger(__name__)


@dataclass
class RAGState:
    question: str
    user_id: str | None = None
    context: str | None = None
    answer: str | None = None


def _get_chat_model() -> BaseChatModel:
    s = get_settings()
    provider = s.use_provider.upper()
    if provider == "OLLAMA":
        return ChatOllama(
            base_url=s.ollama_url,
            model=s.ollama_llm_model,
        )
    elif provider == "OPENAI":
        return ChatOpenAI(
            model="gpt-4o-mini",
            api_key=s.openai_api_key,
            temperature=0.2,
        )
    elif provider == "ANTHROPIC":
        return ChatAnthropic(
            model="claude-3-5-sonnet-20241022",
            api_key=s.anthropic_api_key,
            temperature=0.2,
        )
    else:
        raise ValueError(f"Unsupported USE_PROVIDER value: {provider}")


def retrieve_node(state: RAGState) -> RAGState:
    logger.info("Retrieving documents for query: %s", state.question)
    docs = similarity_search(state.question, k=5, user_id=state.user_id)
    joined = "\n\n".join(
        f"From {d.metadata.get('file_name')}: {d.page_content}" for d in docs
    )
    state.context = joined
    return state


def generate_node(state: RAGState) -> RAGState:
    logger.info("Generating answer for query")
    llm = _get_chat_model()
    system = (
        "You are a retrieval-augmented assistant for the Business Idea Generator (BIG). "
        "Answer the user's question using ONLY the provided context. "
        "If the context is not sufficient to answer safely, say you don't know."
    )
    prompt = [
        ("system", system),
        ("user", f"Question: {state.question}\n\nContext:\n{state.context or 'NO CONTEXT'}"),
    ]
    msg = llm.invoke(prompt)
    state.answer = msg.content
    return state


def build_graph() -> Any:
    graph = StateGraph(RAGState)

    graph.add_node("retrieve", retrieve_node)
    graph.add_node("generate", generate_node)

    graph.set_entry_point("retrieve")
    graph.add_edge("retrieve", "generate")
    graph.add_edge("generate", END)

    return graph.compile()
