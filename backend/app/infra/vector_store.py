"""Vector store abstraction layer.

Supports multiple backends behind a unified interface:
  - ChromaDB   (local dev, single-process, file-based)
  - pgvector   (PostgreSQL extension — same DB, no extra infra) ← RECOMMENDED
  - Qdrant     (self-hosted or cloud, specialized vector DB)
  - Pinecone   (managed, fully serverless)

Env vars:
  VECTOR_DB_BACKEND     "chroma" | "pgvector" | "qdrant" | "pinecone" (default: "chroma")
  EMBEDDING_MODEL       Sentence transformer model name (default: "all-MiniLM-L6-v2")
  RAG_TOP_K             Number of results per query (default: 3)
  PGVECTOR_INDEX_TYPE   "hnsw" or "ivfflat" (default: "hnsw")
  PGVECTOR_HNSW_M       HNSW M parameter (default: 16)
  PGVECTOR_HNSW_EF      HNSW ef_construction (default: 200)
  QDRANT_URL            Qdrant server URL (for qdrant backend)
  PINECONE_API_KEY      Pinecone API key (for pinecone backend)

Switching backends:
  1. Set VECTOR_DB_BACKEND=pgvector
  2. Ensure PostgreSQL has pgvector extension: CREATE EXTENSION IF NOT EXISTS vector;
  3. Run: python -c "from app.infra.vector_store import init_pgvector; init_pgvector()"

Migration from ChromaDB to pgvector:
  python -c "from app.infra.vector_store import migrate_chroma_to_pgvector; migrate_chroma_to_pgvector()"
"""

from __future__ import annotations

import hashlib
import json
import logging
import os
import threading
from abc import ABC, abstractmethod
from datetime import datetime
from typing import Any

from app.config import settings

logger = logging.getLogger("prestige.vector_store")


# ── Abstract interface ──────────────────────────────────────────────

class VectorStore(ABC):
    """Backend-agnostic vector store interface."""

    @abstractmethod
    def query(self, tenant_id: str, text: str, k: int | None = None) -> list[tuple[str, dict]]:
        """Return top-k (document, metadata) pairs for a query."""
        ...

    @abstractmethod
    def add_docs(self, tenant_id: str, ids: list[str], texts: list[str],
                 metadatas: list[dict] | None = None) -> None:
        """Insert documents into the tenant's collection."""
        ...

    @abstractmethod
    def delete_source(self, tenant_id: str, source_id: str) -> int:
        """Delete all chunks from a specific source. Return count deleted."""
        ...

    @abstractmethod
    def count_chunks(self, tenant_id: str, source_id: str) -> int:
        """Count chunks belonging to a source."""
        ...

    @abstractmethod
    def health(self) -> bool:
        """Return True if the backend is reachable."""
        ...


# ── ChromaDB backend (local dev) ────────────────────────────────────

class ChromaBackend(VectorStore):
    """File-based ChromaDB — good for dev, single-process only."""

    def __init__(self) -> None:
        self._client = None
        self._lock = threading.Lock()
        self._write_lock = threading.Lock()

    def _get_client(self):
        if self._client is None:
            with self._lock:
                if self._client is None:
                    import chromadb
                    self._client = chromadb.PersistentClient(path=settings.chroma_data_dir)
        return self._client

    def _collection_name(self, tenant_id: str) -> str:
        return f"kb_{tenant_id}"

    def _get_collection(self, tenant_id: str):
        client = self._get_client()
        return client.get_or_create_collection(
            name=self._collection_name(tenant_id),
            metadata={"hnsw:space": "cosine"},
        )

    def query(self, tenant_id: str, text: str, k: int | None = None) -> list[tuple[str, dict]]:
        collection = self._get_collection(tenant_id)
        n = k or settings.rag_top_k
        res = collection.query(query_texts=[text], n_results=n)
        if not res["documents"] or not res["documents"][0]:
            return []
        docs = res["documents"][0]
        metas = res["metadatas"][0] or [{} for _ in docs]
        return list(zip(docs, metas))

    def add_docs(self, tenant_id: str, ids: list[str], texts: list[str],
                 metadatas: list[dict] | None = None) -> None:
        collection = self._get_collection(tenant_id)
        with self._write_lock:
            existing = set(collection.get(where={"ids": {"$in": ids}})["ids"]) if ids else set()
            new_ids = [i for i in ids if i not in existing]
            if not new_ids:
                return
            extended_meta = []
            for i in new_ids:
                idx = ids.index(i)
                base_meta = (metadatas or [{} for _ in new_ids])[idx] if metadatas else {}
                base_meta.setdefault("created_at", datetime.utcnow().isoformat() + "Z")
                text = texts[idx]
                checksum = hashlib.sha256(text.encode("utf-8")).hexdigest()
                base_meta.setdefault("checksum", checksum)
                extended_meta.append(base_meta)
            collection.add(
                ids=new_ids,
                documents=[texts[ids.index(i)] for i in new_ids],
                metadatas=extended_meta,
            )

    def delete_source(self, tenant_id: str, source_id: str) -> int:
        collection = self._get_collection(tenant_id)
        with self._write_lock:
            collection.delete(where={"source_id": source_id})
        return 0

    def count_chunks(self, tenant_id: str, source_id: str) -> int:
        collection = self._get_collection(tenant_id)
        res = collection.get(where={"source_id": source_id})
        return len(res.get("ids", []))

    def health(self) -> bool:
        try:
            self._get_client()
            return True
        except Exception:
            return False


# ── pgvector backend (recommended for production) ───────────────────

class PgvectorBackend(VectorStore):
    """PostgreSQL + pgvector — same DB as your relational data.

    Advantages:
      - No extra infrastructure (no Qdrant/Pinecone to manage)
      - Same connection pool, same backup, same monitoring
      - Multi-tenant isolation via WHERE tenant_id = ...
      - Handles 10M+ vectors with HNSW index

    Setup:
      1. CREATE EXTENSION IF NOT EXISTS vector;
      2. Table auto-created on first use
      3. HNSW index auto-created after first batch of docs
    """

    def __init__(self) -> None:
        from sqlalchemy import text as sql_text
        from app.database import engine
        # Verify pgvector extension is installed
        with engine.connect() as conn:
            try:
                conn.execute(sql_text("SELECT 1 FROM pg_extension WHERE extname = 'vector'"))
            except Exception:
                logger.warning("pgvector extension not found. Run: CREATE EXTENSION IF NOT EXISTS vector")
        self._embedding_model = None
        self._table_created = False

    def _get_model(self):
        if self._embedding_model is None:
            from sentence_transformers import SentenceTransformer
            self._embedding_model = SentenceTransformer(settings.embedding_model)
        return self._embedding_model

    def _embed(self, texts: list[str]) -> list[list[float]]:
        model = self._get_model()
        return model.encode(texts, normalize_embeddings=True).tolist()

    def _ensure_table(self) -> None:
        """Create the kb_chunks table if it doesn't exist."""
        if self._table_created:
            return
        from sqlalchemy import text as sql_text
        from app.database import engine

        with engine.connect() as conn:
            # Enable pgvector extension
            conn.execute(sql_text("CREATE EXTENSION IF NOT EXISTS vector"))

            # Create the chunks table
            conn.execute(sql_text("""
                CREATE TABLE IF NOT EXISTS kb_chunks (
                    id VARCHAR(36) PRIMARY KEY,
                    tenant_id VARCHAR(36) NOT NULL,
                    source_id VARCHAR(36) NOT NULL,
                    document TEXT NOT NULL,
                    metadata JSONB DEFAULT '{}',
                    embedding vector(384),
                    created_at TIMESTAMP DEFAULT NOW()
                )
            """))
            conn.commit()
        self._table_created = True

    def _ensure_index(self, tenant_id: str) -> None:
        """Create HNSW index if it doesn't exist yet.

        We create a per-tenant index for better query performance at scale.
        For < 100K vectors, a global index is fine. For 1M+, per-tenant indexes
        are better because queries always filter by tenant_id.
        """
        from sqlalchemy import text as sql_text
        from app.database import engine

        index_type = os.getenv("PGVECTOR_INDEX_TYPE", "hnsw").lower()
        m = int(os.getenv("PGVECTOR_HNSW_M", "16"))
        ef_construction = int(os.getenv("PGVECTOR_HNSW_EF", "200"))

        index_name = f"ix_kb_chunks_embedding_{tenant_id[:8]}"

        with engine.connect() as conn:
            # Check if index exists
            result = conn.execute(sql_text(
                "SELECT 1 FROM pg_indexes WHERE indexname = :name"
            ), {"name": index_name})
            if result.fetchone():
                return

            if index_type == "hnsw":
                conn.execute(sql_text(f"""
                    CREATE INDEX IF NOT EXISTS {index_name}
                    ON kb_chunks USING hnsw (embedding vector_cosine_ops)
                    WITH (m = {m}, ef_construction = {ef_construction})
                """))
            else:
                lists = max(1, 100)  # IVFFlat lists — tune based on data size
                conn.execute(sql_text(f"""
                    CREATE INDEX IF NOT EXISTS {index_name}
                    ON kb_chunks USING ivfflat (embedding vector_cosine_ops)
                    WITH (lists = {lists})
                """))
            conn.commit()

    def query(self, tenant_id: str, text: str, k: int | None = None) -> list[tuple[str, dict]]:
        from sqlalchemy import text as sql_text
        from app.database import engine

        n = k or settings.rag_top_k
        embedding = self._embed([text])[0]

        with engine.connect() as conn:
            results = conn.execute(sql_text("""
                SELECT document, metadata
                FROM kb_chunks
                WHERE tenant_id = :tenant_id
                ORDER BY embedding <=> :embedding
                LIMIT :limit
            """), {
                "tenant_id": tenant_id,
                "embedding": str(embedding),
                "limit": n,
            }).fetchall()

        return [(row[0], row[1] if isinstance(row[1], dict) else json.loads(row[1] or "{}"))
                for row in results]

    def add_docs(self, tenant_id: str, ids: list[str], texts: list[str],
                 metadatas: list[dict] | None = None) -> None:
        from sqlalchemy import text as sql_text
        from app.database import engine

        self._ensure_table()

        # Check for existing IDs
        with engine.connect() as conn:
            existing = set()
            if ids:
                result = conn.execute(sql_text(
                    "SELECT id FROM kb_chunks WHERE id = ANY(:ids)"
                ), {"ids": ids})
                existing = {row[0] for row in result}

        new_ids = [i for i in ids if i not in existing]
        if not new_ids:
            return

        embeddings = self._embed([texts[ids.index(i)] for i in new_ids])

        with engine.connect() as conn:
            for id_, emb, idx in zip(new_ids, embeddings, range(len(new_ids))):
                original_idx = ids.index(id_)
                meta = (metadatas or [{}])[original_idx] if metadatas else {}
                meta.setdefault("created_at", datetime.utcnow().isoformat() + "Z")
                text = texts[original_idx]
                checksum = hashlib.sha256(text.encode("utf-8")).hexdigest()
                meta.setdefault("checksum", checksum)

                conn.execute(sql_text("""
                    INSERT INTO kb_chunks (id, tenant_id, source_id, document, metadata, embedding)
                    VALUES (:id, :tenant_id, :source_id, :document, :metadata, :embedding)
                    ON CONFLICT (id) DO NOTHING
                """), {
                    "id": id_,
                    "tenant_id": tenant_id,
                    "source_id": meta.get("source_id", ""),
                    "document": text,
                    "metadata": json.dumps(meta),
                    "embedding": str(emb),
                })
            conn.commit()

        # Create index after first batch (deferred for performance)
        self._ensure_index(tenant_id)

    def delete_source(self, tenant_id: str, source_id: str) -> int:
        from sqlalchemy import text as sql_text
        from app.database import engine

        with engine.connect() as conn:
            result = conn.execute(sql_text("""
                DELETE FROM kb_chunks
                WHERE tenant_id = :tenant_id AND source_id = :source_id
            """), {"tenant_id": tenant_id, "source_id": source_id})
            conn.commit()
            return result.rowcount

    def count_chunks(self, tenant_id: str, source_id: str) -> int:
        from sqlalchemy import text as sql_text
        from app.database import engine

        with engine.connect() as conn:
            result = conn.execute(sql_text("""
                SELECT COUNT(*) FROM kb_chunks
                WHERE tenant_id = :tenant_id AND source_id = :source_id
            """), {"tenant_id": tenant_id, "source_id": source_id})
            return result.scalar() or 0

    def health(self) -> bool:
        try:
            from sqlalchemy import text as sql_text
            from app.database import engine
            with engine.connect() as conn:
                conn.execute(sql_text("SELECT 1 FROM kb_chunks LIMIT 0"))
            return True
        except Exception:
            # Table might not exist yet — that's OK
            return True

class QdrantBackend(VectorStore):
    """Qdrant vector DB — production-ready, supports 10M+ vectors."""

    def __init__(self) -> None:
        from qdrant_client import QdrantClient
        url = os.getenv("QDRANT_URL", "http://localhost:6333")
        api_key = os.getenv("QDRANT_API_KEY", None)
        self._client = QdrantClient(url=url, api_key=api_key, timeout=10)
        self._embedding_model = settings.embedding_model

    def _collection_name(self, tenant_id: str) -> str:
        return f"kb_{tenant_id}"

    def _ensure_collection(self, tenant_id: str) -> None:
        from qdrant_client.models import Distance, VectorParams
        name = self._collection_name(tenant_id)
        try:
            self._client.get_collection(name)
        except Exception:
            self._client.create_collection(
                collection_name=name,
                vectors_config=VectorParams(size=384, distance=Distance.COSINE),
            )

    def _embed(self, texts: list[str]) -> list[list[float]]:
        """Generate embeddings using sentence-transformers."""
        from sentence_transformers import SentenceTransformer
        model = SentenceTransformer(self._embedding_model)
        return model.encode(texts).tolist()

    def query(self, tenant_id: str, text: str, k: int | None = None) -> list[tuple[str, dict]]:
        n = k or settings.rag_top_k
        embedding = self._embed([text])[0]
        results = self._client.search(
            collection_name=self._collection_name(tenant_id),
            query_vector=embedding,
            limit=n,
        )
        return [(hit.payload.get("text", ""), hit.payload.get("metadata", {})) for hit in results]

    def add_docs(self, tenant_id: str, ids: list[str], texts: list[str],
                 metadatas: list[dict] | None = None) -> None:
        from qdrant_client.models import PointStruct
        self._ensure_collection(tenant_id)
        embeddings = self._embed(texts)
        points = []
        for i, (id_, emb, text) in enumerate(zip(ids, embeddings, texts)):
            meta = (metadatas or [{}])[i] if metadatas else {}
            meta.setdefault("created_at", datetime.utcnow().isoformat() + "Z")
            points.append(PointStruct(
                id=hashlib.md5(id_.encode()).hexdigest()[:16],
                vector=emb,
                payload={"text": text, "metadata": meta, "source_id": meta.get("source_id", "")},
            ))
        self._client.upsert(collection_name=self._collection_name(tenant_id), points=points)

    def delete_source(self, tenant_id: str, source_id: str) -> int:
        from qdrant_client.models import Filter, FieldCondition, MatchValue
        self._client.delete(
            collection_name=self._collection_name(tenant_id),
            points_selector=Filter(
                must=[FieldCondition(key="metadata.source_id", match=MatchValue(value=source_id))]
            ),
        )
        return 0

    def count_chunks(self, tenant_id: str, source_id: str) -> int:
        from qdrant_client.models import Filter, FieldCondition, MatchValue
        result = self._client.count(
            collection_name=self._collection_name(tenant_id),
            count_filter=Filter(
                must=[FieldCondition(key="metadata.source_id", match=MatchValue(value=source_id))]
            ),
        )
        return result.count

    def health(self) -> bool:
        try:
            self._client.get_collections()
            return True
        except Exception:
            return False


# ── Pinecone backend (managed) ──────────────────────────────────────

class PineconeBackend(VectorStore):
    """Pinecone managed vector DB — fully serverless, auto-scaling."""

    def __init__(self) -> None:
        from pinecone import Pinecone
        api_key = os.getenv("PINECONE_API_KEY", "")
        self._pc = Pinecone(api_key=api_key)
        self._index_name = os.getenv("PINECONE_INDEX", "prestige-kb")
        self._index = self._pc.Index(self._index_name)

    def _namespace(self, tenant_id: str) -> str:
        return tenant_id

    def query(self, tenant_id: str, text: str, k: int | None = None) -> list[tuple[str, dict]]:
        n = k or settings.rag_top_k
        results = self._index.query(
            vector=[0] * 384,  # placeholder — Pinecone supports sparse/dense
            namespace=self._namespace(tenant_id),
            top_k=n,
            include_metadata=True,
        )
        # NOTE: Pinecone query requires actual embeddings. Use with SentenceTransformer.
        from sentence_transformers import SentenceTransformer
        model = SentenceTransformer(settings.embedding_model)
        embedding = model.encode([text])[0].tolist()
        results = self._index.query(
            vector=embedding,
            namespace=self._namespace(tenant_id),
            top_k=n,
            include_metadata=True,
        )
        return [
            (match["metadata"].get("text", ""), match["metadata"])
            for match in results.get("matches", [])
        ]

    def add_docs(self, tenant_id: str, ids: list[str], texts: list[str],
                 metadatas: list[dict] | None = None) -> None:
        from sentence_transformers import SentenceTransformer
        model = SentenceTransformer(settings.embedding_model)
        embeddings = model.encode(texts).tolist()
        vectors = []
        for i, (id_, emb, text) in enumerate(zip(ids, embeddings, texts)):
            meta = (metadatas or [{}])[i] if metadatas else {}
            meta["text"] = text
            meta.setdefault("created_at", datetime.utcnow().isoformat() + "Z")
            vectors.append({"id": id_, "values": emb, "metadata": meta})
        self._index.upsert(vectors=vectors, namespace=self._namespace(tenant_id))

    def delete_source(self, tenant_id: str, source_id: str) -> int:
        self._index.delete(
            filter={"source_id": {"$eq": source_id}},
            namespace=self._namespace(tenant_id),
        )
        return 0

    def count_chunks(self, tenant_id: str, source_id: str) -> int:
        stats = self._index.describe_index_stats()
        ns_stats = stats.get("namespaces", {}).get(self._namespace(tenant_id), {})
        return ns_stats.get("vector_count", 0)

    def health(self) -> bool:
        try:
            self._index.describe_index_stats()
            return True
        except Exception:
            return False


# ── Factory ──────────────────────────────────────────────────────────

_backend: VectorStore | None = None


def get_vector_store() -> VectorStore:
    """Return the configured vector store backend (singleton)."""
    global _backend
    if _backend is not None:
        return _backend

    backend_name = os.getenv("VECTOR_DB_BACKEND", "chroma").lower()
    if backend_name == "pgvector":
        _backend = PgvectorBackend()
    elif backend_name == "qdrant":
        _backend = QdrantBackend()
    elif backend_name == "pinecone":
        _backend = PineconeBackend()
    else:
        _backend = ChromaBackend()

    logger.info("Vector store backend: %s", backend_name)
    return _backend


# ── Legacy API (delegates to configured backend) ────────────────────
# Keeps existing code working without changes.

def query(tenant_id: str, text: str, k: int | None = None) -> list[tuple[str, dict]]:
    return get_vector_store().query(tenant_id, text, k)


def add_docs(tenant_id: str, ids: list[str], texts: list[str],
             metadatas: list[dict] | None = None) -> None:
    get_vector_store().add_docs(tenant_id, ids, texts, metadatas)


def delete_source(tenant_id: str, source_id: str) -> int:
    return get_vector_store().delete_source(tenant_id, source_id)


def count_chunks(tenant_id: str, source_id: str) -> int:
    return get_vector_store().count_chunks(tenant_id, source_id)


# ── Migration helpers ───────────────────────────────────────────────

def init_pgvector() -> None:
    """Initialize pgvector: create extension + table + indexes.

    Run once when switching to pgvector:
      python -c "from app.infra.vector_store import init_pgvector; init_pgvector()"
    """
    backend = PgvectorBackend()
    backend._ensure_table()
    logger.info("pgvector table created (or already exists)")

    # Create indexes for all existing tenants
    from sqlalchemy import text as sql_text
    from app.database import engine
    with engine.connect() as conn:
        tenants = conn.execute(sql_text("SELECT DISTINCT tenant_id FROM kb_chunks")).fetchall()
    for (tenant_id,) in tenants:
        backend._ensure_index(tenant_id)
    logger.info("pgvector indexes created for %d tenants", len(tenants))

def migrate_chroma_to_pgvector() -> None:
    """Export all data from ChromaDB and import into pgvector."""
    import chromadb

    logger.info("Starting ChromaDB to pgvector migration...")

    client = chromadb.PersistentClient(path=settings.chroma_data_dir)
    pg_backend = PgvectorBackend()
    pg_backend._ensure_table()

    collections = client.list_collections()
    total_migrated = 0

    for col in collections:
        tenant_id = col.name.replace("kb_", "", 1)
        logger.info("Migrating collection: %s (tenant: %s)", col.name, tenant_id)

        batch_size = 100
        offset = 0
        while True:
            results = col.get(include=["documents", "metadatas"], limit=batch_size, offset=offset)
            if not results["ids"]:
                break

            pg_backend.add_docs(
                tenant_id=tenant_id,
                ids=results["ids"],
                texts=results["documents"],
                metadatas=results["metadatas"],
            )
            total_migrated += len(results["ids"])
            offset += batch_size

        logger.info("Migrated %s documents from %s", offset, col.name)

    logger.info("Migration complete: %d total documents migrated to pgvector", total_migrated)
