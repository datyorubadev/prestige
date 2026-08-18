"""Backfill missing KB-source embeddings in an existing database.

Sources created before real chunking/embedding was wired into seeding have
stored text but no vectors in the per-tenant Chroma collection, so RAG
retrieval never surfaces them. This script re-chunks and embeds any source
that is missing vectors (idempotent — existing chunks are left untouched).

Usage (from backend/):
    .venv\\Scripts\\python.exe scripts\\backfill_kb_embeddings.py
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.database import SessionLocal  # noqa: E402
from app.models import KnowledgeSource  # noqa: E402
from app.services import vector_store  # noqa: E402
from app.services.ingestion import embed_source  # noqa: E402


def main() -> None:
    db = SessionLocal()
    try:
        embedded = skipped = 0
        sources = db.query(KnowledgeSource).filter(KnowledgeSource.text.isnot(None)).all()
        for source in sources:
            present = vector_store.count_chunks(source.tenant_id, str(source.id))
            if present >= source.chunk_count and source.chunk_count > 0:
                skipped += 1
                continue
            chunks = embed_source(db, source)
            if chunks:
                embedded += 1
                print(f"  embedded {source.id} ({source.source_name}): {chunks} chunk(s)")
        print(f"Done: {embedded} source(s) embedded, {skipped} already complete.")
    finally:
        db.close()


if __name__ == "__main__":
    main()
