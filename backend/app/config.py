from functools import lru_cache
import logging
import os

from pydantic_settings import BaseSettings, SettingsConfigDict

logger = logging.getLogger("prestige.config")


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    # Core
    environment: str = "development"
    secret_key: str = "change-me-strong-random-64-chars"
    database_url: str = "sqlite:///./support_portal.db"
    cors_origins: str = "*"
    frontend_url: str = "http://localhost:3000"

    # Auth
    access_token_expire_minutes: int = 15
    refresh_token_expire_days: int = 7
    reset_token_expire_minutes: int = 60
    algorithm: str = "HS256"

    # Groq
    groq_api_key: str = ""
    groq_chat_model: str = "llama-3.3-70b-versatile"
    groq_stt_model: str = "whisper-large-v3-turbo"

    # AI replies
    max_reply_words: int = 200
    ai_guardrails: bool = True

    # Vector DB
    chroma_data_dir: str = "./chroma_data"
    embedding_model: str = "all-MiniLM-L6-v2"
    rag_top_k: int = 3
    chunk_size: int = 1000
    chunk_overlap: int = 150

    # Redis
    redis_url: str = "redis://localhost:6379/0"
    graph_checkpointer: str = "memory"

    # Email
    email_mock: bool = True
    smtp_host: str = ""
    smtp_port: int = 587
    smtp_user: str = ""
    smtp_pass: str = ""
    from_email: str = "noreply@portal.ng"

    # Rate limiting
    rate_limit_auth_per_min: int = 10
    rate_limit_chat_per_min: int = 30
    rate_limit_ingest_per_min: int = 5
    rate_limit_admin_per_min: int = 30

    # Super admin bootstrap
    super_admin_email: str = "root@portal.ng"

    # Invites
    invite_expire_days: int = 3

    # Impersonation
    impersonation_expire_minutes: int = 30

    # ── Infrastructure (new for scale) ───────────────────────────────

    # Database replicas
    database_read_url: str = ""  # Optional read replica URL

    # Vector DB backend: "chroma" | "qdrant" | "pinecone"
    vector_db_backend: str = "chroma"

    # Qdrant (when vector_db_backend = "qdrant")
    qdrant_url: str = "http://localhost:6333"
    qdrant_api_key: str = ""

    # Pinecone (when vector_db_backend = "pinecone")
    pinecone_api_key: str = ""
    pinecone_index: str = "prestige-kb"

    # Task queue
    task_queue_enabled: bool = False  # True in production with Redis
    task_max_retries: int = 3
    task_retry_delay: int = 30

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    loaded = Settings()
    if loaded.environment == "production":
        if loaded.secret_key == "change-me-strong-random-64-chars":
            logger.warning("SECRET_KEY is still the default value — set a strong random value in .env")
        if loaded.super_admin_password == "change-me-now":
            logger.warning("SUPER_ADMIN_PASSWORD is still the default value — set a strong password in .env")
    return loaded


settings = get_settings()
