# settings.py
from functools import lru_cache
from pathlib import Path
from typing import Literal

from dotenv import load_dotenv
from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

# Project root: .../langgraph_ai_big_rag
ROOT_DIR = Path(__file__).resolve().parents[3]
ENV_PATH = ROOT_DIR / ".env"
load_dotenv(ENV_PATH, override=False)


class Settings(BaseSettings):
    # Paths
    index_dir: Path = Field(default=ROOT_DIR / "backend" / "sample_runs", alias="INDEX_DIR")
    embedding_dir: Path = Field(default=ROOT_DIR / "backend" / "data" / "embeddings", alias="EMBEDDING_DIR")

    # Optional explicit path to mmdc (Mermaid CLI)
    mmdc_path: str | None = Field(default=None, alias="MMDC_PATH")

    # Provider credentials / URLs
    openai_api_key: str | None = Field(default=None, alias="OPENAI_API_KEY")
    anthropic_api_key: str | None = Field(default=None, alias="ANTHROPIC_API_KEY")
    ollama_url: str | None = Field(default=None, alias="OLLAMA_URL")

    # Models
    ollama_llm_model: str = Field(default="qwen2.5-coder:7b-8k", alias="OLLAMA_LLM_MODEL")
    ollama_embedding_model: str = Field(default="nomic-embed-text", alias="OLLAMA_EMBEDDING_MODEL")
    openai_embedding_model: str = Field(default="text-embedding-3-small", alias="OPENAI_EMBEDDING_MODEL")
    anthropic_embedding_model: str = Field(default="text-embedding-3-small", alias="ANTHROPIC_EMBEDDING_MODEL")

    # Provider selector
    use_provider: Literal["OLLAMA", "OPENAI", "ANTHROPIC"] = Field(
        default="OLLAMA", alias="USE_PROVIDER"
    )

    # Logging
    log_level: str = Field(default="INFO", alias="LOG_LEVEL")
    db_log_level: str = Field(default="INFO", alias="DB_LOG_LEVEL")

    model_config = SettingsConfigDict(
        env_file=str(ENV_PATH),
        case_sensitive=False,
        extra="ignore",
    )


@lru_cache()
def get_settings() -> Settings:
    return Settings()
