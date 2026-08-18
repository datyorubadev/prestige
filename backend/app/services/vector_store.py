"""Chroma vector store wrapper. One collection per tenant (guide §6.1).

Uses Chroma's bundled all-MiniLM-L6-v2 ONNX embedding function so no
separate torch/sentence-transformers install is required.

Thread-safety: PersistentClient is NOT thread-safe for concurrent writes.
We use a write lock for add/delete operations. Reads (query/get) are safe
to run concurrently with each other but NOT with writes — Chroma's internal
HNSW index can corrupt if a write and read race. The lock serializes all
mutations while keeping reads lock-free (Chroma handles read-read concurrency
internally for PersistentClient).
"""

from app.config import settings
import threading
from datetime import datetime
import hashlib

_client = None
_client_lock = threading.Lock()
_write_lock = threading.Lock()  # serializes all Chroma mutations


def get_client():
    global _client
    if _client is None:
        with _client_lock:
            if _client is None:
                import chromadb
                _client = chromadb.PersistentClient(path=settings.chroma_data_dir)
    return _client


def collection_name(tenant_id: str) -> str:
    return f"kb_{tenant_id}"


def get_collection(tenant_id: str):
    client = get_client()
    return client.get_or_create_collection(
        name=collection_name(tenant_id), metadata={"hnsw:space": "cosine"}
    )


def add_docs(tenant_id: str, ids: list[str], texts: list[str], metadatas: list[dict] | None = None) -> None:
    collection = get_collection(tenant_id)
    with _write_lock:
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


def query(tenant_id: str, text: str, k: int | None = None) -> list[tuple[str, dict]]:
    collection = get_collection(tenant_id)
    n = k or settings.rag_top_k
    res = collection.query(query_texts=[text], n_results=n)
    if not res["documents"] or not res["documents"][0]:
        return []
    docs = res["documents"][0]
    metas = res["metadatas"][0] or [{} for _ in docs]
    return list(zip(docs, metas))


def delete_source(tenant_id: str, source_id: str) -> int:
    collection = get_collection(tenant_id)
    with _write_lock:
        collection.delete(where={"source_id": source_id})
    return 0


def count_chunks(tenant_id: str, source_id: str) -> int:
    collection = get_collection(tenant_id)
    res = collection.get(where={"source_id": source_id})
    return len(res.get("ids", []))
