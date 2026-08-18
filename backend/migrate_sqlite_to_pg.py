"""Migrate all data from SQLite support_portal.db to Neon PostgreSQL.

1. Truncates all PostgreSQL tables (CASCADE to respect FKs)
2. Copies all data from SQLite in FK-safe order (topological sort)

Usage: python migrate_sqlite_to_pg.py
"""
import sys
import time
from collections import defaultdict, deque

sys.stdout.write("=== SQLite -> PostgreSQL Full Migration ===\n"); sys.stdout.flush()

from dotenv import load_dotenv
load_dotenv()

from sqlalchemy import create_engine, text
from app.config import settings
from datetime import datetime

sqlite_engine = create_engine("sqlite:///./support_portal.db")
pg_engine = create_engine(
    settings.database_url,
    connect_args={"connect_timeout": 30},
    pool_recycle=120,
    pool_pre_ping=True,
)

# Get table names from SQLite
with sqlite_engine.connect() as conn:
    sqlite_tables = {r[0] for r in conn.execute(text(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
    )).fetchall()}

# Get table names from PG
with pg_engine.connect() as conn:
    pg_tables = {r[0] for r in conn.execute(text(
        "SELECT table_name FROM information_schema.tables WHERE table_schema='public'"
    )).fetchall()}

# Get boolean columns per table from PG
pg_boolean_cols: dict[str, set[str]] = {}
with pg_engine.connect() as conn:
    rows = conn.execute(text(
        "SELECT table_name, column_name FROM information_schema.columns "
        "WHERE table_schema='public' AND data_type='boolean'"
    )).fetchall()
    for table_name, col_name in rows:
        pg_boolean_cols.setdefault(table_name, set()).add(col_name)

# Build topological sort from SQLite FK constraints
with sqlite_engine.connect() as conn:
    fk_rows = conn.execute(text(
        "SELECT name, \"table\", \"from\", \"to\", \"table\" AS ref_table "
        "FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
    )).fetchall()

# Actually get FK info properly from PRAGMA for each table
dep_graph: dict[str, set[str]] = {t: set() for t in sqlite_tables}
with sqlite_engine.connect() as conn:
    for table in sqlite_tables:
        try:
            fks = conn.execute(text(f'PRAGMA foreign_key_list("{table}")')).fetchall()
            for fk in fks:
                ref_table = fk[2]  # table column
                if ref_table in dep_graph:
                    dep_graph[table].add(ref_table)
        except Exception:
            pass

# Topological sort (Kahn's algorithm)
in_degree = {t: 0 for t in sqlite_tables}
for t, deps in dep_graph.items():
    for d in deps:
        if d in in_degree:
            in_degree[t] += 1  # t depends on d

queue = deque([t for t, deg in in_degree.items() if deg == 0])
sorted_tables = []
while queue:
    node = queue.popleft()
    sorted_tables.append(node)
    for t, deps in dep_graph.items():
        if node in deps:
            in_degree[t] -= 1
            if in_degree[t] == 0:
                queue.append(t)

if len(sorted_tables) != len(sqlite_tables):
    missing = sqlite_tables - set(sorted_tables)
    sys.stdout.write(f"WARNING: {len(missing)} tables have circular deps: {missing}\n")
    sorted_tables.extend(sorted(missing))

common_tables = sqlite_tables & pg_tables
ordered = [t for t in sorted_tables if t in common_tables]

sys.stdout.write(f"Tables to migrate: {len(ordered)} (common: {len(common_tables)})\n")
sys.stdout.write(f"Boolean columns detected: {sum(len(v) for v in pg_boolean_cols.values())} across {len(pg_boolean_cols)} tables\n")
sys.stdout.flush()

# 1. Truncate all tables
sys.stdout.write("\nTruncating PostgreSQL tables...\n"); sys.stdout.flush()
with pg_engine.connect() as conn:
    for table in reversed(ordered):
        try:
            conn.execute(text(f'TRUNCATE TABLE "{table}" RESTART IDENTITY CASCADE'))
        except Exception:
            try:
                conn.execute(text(f'DELETE FROM "{table}"'))
            except Exception:
                pass
    conn.commit()
sys.stdout.write("Tables truncated.\n"); sys.stdout.flush()

# 2. Migrate data
total_rows = 0
t_start = time.time()

for table in ordered:
    if table not in common_tables:
        continue

    with sqlite_engine.connect() as sql_conn:
        rows = sql_conn.execute(text(f'SELECT * FROM "{table}"')).fetchall()
    if not rows:
        continue

    # Get column names from sqlite
    with sqlite_engine.connect() as sql_conn2:
        cols_info = sql_conn2.execute(text(f'PRAGMA table_info("{table}")')).fetchall()
        columns = [c[1] for c in cols_info]

    bool_cols = pg_boolean_cols.get(table, set())

    clean_rows = []
    for row in rows:
        d = {}
        for i, col in enumerate(columns):
            val = row[i]
            # Convert SQLite datetime strings
            if isinstance(val, str) and any(k in col for k in ("_at", "_date", "_time")):
                try:
                    val = datetime.fromisoformat(val.replace("Z", "+00:00")).replace(tzinfo=None)
                except (ValueError, TypeError):
                    pass
            # Convert SQLite integer booleans for BOOLEAN columns
            if col in bool_cols and isinstance(val, int) and val in (0, 1):
                val = bool(val)
            d[col] = val
        clean_rows.append(d)

    for i in range(0, len(clean_rows), 100):
        batch = clean_rows[i:i+100]
        cols_str = ", ".join(f'"{c}"' for c in columns)
        placeholders = ", ".join(f":{c}" for c in columns)
        for attempt in range(3):
            try:
                with pg_engine.connect() as pg_conn:
                    pg_conn.execute(text(f'INSERT INTO "{table}" ({cols_str}) VALUES ({placeholders}) ON CONFLICT DO NOTHING'), batch)
                    pg_conn.commit()
                break
            except Exception as e:
                sys.stdout.write(f"    batch {i//100+1} attempt {attempt+1}: {type(e).__name__}\n"); sys.stdout.flush()
                pg_engine.dispose()
                import time as _t; _t.sleep(3)

    total_rows += len(rows)
    sys.stdout.write(f"  {table}: {len(rows)} rows\n"); sys.stdout.flush()

elapsed = time.time() - t_start
sys.stdout.write(f"\nDone: {total_rows} rows in {elapsed:.1f}s\n"); sys.stdout.flush()

sqlite_engine.dispose()
pg_engine.dispose()
