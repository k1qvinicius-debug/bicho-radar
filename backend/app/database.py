"""
Camada de Banco de Dados Híbrida (Supabase PostgreSQL + SQLite Fallback) para o Bicho Analytics.
Gerencia conexões, compatibilidade de dialeto, inicialização de tabelas, migrações e transações.
"""

import os
import json
import sqlite3
import logging
import datetime
from contextlib import contextmanager
from typing import Generator, Any

try:
    import psycopg2
    import psycopg2.extras
    PSYCOPG2_AVAILABLE = True
except ImportError:
    psycopg2: Any = None
    PSYCOPG2_AVAILABLE = False

logger = logging.getLogger("bicho_analytics.database")

# Caminho do banco local SQLite (utilizado como fallback ou desenvolvimento offline)
DB_PATH = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "bicho_analytics.db")

# URL de conexão com PostgreSQL Dedicado (Hospedado na VPS via Coolify)
DEFAULT_POSTGRES_URL = "postgresql://postgres:9Jx1gwFhtYcJFFF43iF8djZUuy489bxrvSzbb0rjkmho4TOo8VM0HjHZ9LPHuhGo@uwx4ahlymo5ox6ebkxrg4aco:5432/postgres"


def get_db_path() -> str:
    return DB_PATH


def get_database_url() -> str:
    """Retorna a URL do banco configurada em ambiente ou o padrão do PostgreSQL na VPS."""
    return os.getenv("DATABASE_URL", DEFAULT_POSTGRES_URL)



def is_postgres_configured() -> bool:
    """Verifica se o PostgreSQL/Supabase deve ser utilizado."""
    url = get_database_url()
    if not url or url.strip().lower() in ("sqlite", "sqlite3", "local", "none", "false", ""):
        return False
    return url.startswith("postgres://") or url.startswith("postgresql://")


class PgRowWrapper:
    """
    Wrapper sobre linhas retornadas pelo psycopg2.extras.DictRow.
    Garante paridade total com sqlite3.Row:
    - Acesso por índice numérico: row[0]
    - Acesso por chave: row['id']
    - Conversão segura para dict: dict(row)
    - Converte objetos datetime.date e datetime.datetime para string, evitando erros no Pydantic.
    """
    def __init__(self, row):
        self._row = row

    def __getitem__(self, key):
        val = self._row[key]
        if isinstance(val, (datetime.datetime, datetime.date)):
            return str(val)
        return val

    def keys(self):
        return self._row.keys()

    def values(self):
        return [str(v) if isinstance(v, (datetime.datetime, datetime.date)) else v for v in self._row.values()]

    def items(self):
        return [(k, str(v) if isinstance(v, (datetime.datetime, datetime.date)) else v) for k, v in self._row.items()]

    def get(self, key, default=None):
        val = self._row.get(key, default)
        if isinstance(val, (datetime.datetime, datetime.date)):
            return str(val)
        return val

    def __len__(self):
        return len(self._row)

    def __contains__(self, key):
        return key in self._row

    def __iter__(self):
        return iter(self._row)


class PgCursorWrapper:
    """
    Wrapper transparente sobre o cursor do psycopg2.
    - Converte parâmetros de '?' (SQLite) para '%s' (PostgreSQL).
    - Ignora comandos PRAGMA específicos de SQLite.
    - Suporta 'cursor.lastrowid' automaticamente via RETURNING id.
    - Encapsula linhas em PgRowWrapper para compatibilidade idêntica ao sqlite3.Row.
    """
    def __init__(self, cursor):
        self._cur = cursor
        self._lastrowid = None

    def execute(self, query: str, params=None):
        raw = query.strip()
        if raw.upper().startswith("PRAGMA"):
            return self

        pg_query = query.replace("?", "%s")
        is_insert = pg_query.strip().upper().startswith("INSERT")

        # Injeta RETURNING id para suportar cursor.lastrowid nas tabelas com auto-incremento
        if is_insert and "RETURNING" not in pg_query.upper():
            table_lower = pg_query.lower()
            if "bichocerto_atrasados" not in table_lower and "system_settings" not in table_lower:
                pg_query = pg_query.rstrip("; ") + " RETURNING id"
                if params is not None:
                    self._cur.execute(pg_query, tuple(params))
                else:
                    self._cur.execute(pg_query)
                try:
                    row = self._cur.fetchone()
                    self._lastrowid = row[0] if row else None
                except Exception:
                    self._lastrowid = None
                return self

        if params is not None:
            self._cur.execute(pg_query, tuple(params))
        else:
            self._cur.execute(pg_query)
        return self

    def executemany(self, query: str, seq_of_params):
        pg_query = query.replace("?", "%s")
        self._cur.executemany(pg_query, [tuple(p) for p in seq_of_params])
        return self

    def fetchone(self):
        try:
            row = self._cur.fetchone()
            return PgRowWrapper(row) if row is not None else None
        except Exception:
            return None

    def fetchall(self):
        try:
            rows = self._cur.fetchall()
            return [PgRowWrapper(r) for r in rows]
        except Exception:
            return []

    def fetchmany(self, size=None):
        try:
            rows = self._cur.fetchmany(size) if size else self._cur.fetchmany()
            return [PgRowWrapper(r) for r in rows]
        except Exception:
            return []

    @property
    def rowcount(self):
        return self._cur.rowcount

    @property
    def lastrowid(self):
        return self._lastrowid

    def __iter__(self):
        for r in self._cur:
            yield PgRowWrapper(r)

    def __getattr__(self, name):
        return getattr(self._cur, name)


class PgConnectionWrapper:
    """
    Wrapper transparente sobre a conexão do psycopg2.
    Suporta context managers (with conn:), conn.execute(...) e transações commit/rollback.
    """
    def __init__(self, conn):
        self._conn = conn

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        if exc_type is not None:
            self.rollback()
        else:
            self.commit()
        return False

    def cursor(self):
        return PgCursorWrapper(self._conn.cursor(cursor_factory=psycopg2.extras.DictCursor))

    def execute(self, query: str, params=None):
        cur = self.cursor()
        cur.execute(query, params)
        return cur

    def commit(self):
        self._conn.commit()

    def rollback(self):
        self._conn.rollback()

    def close(self):
        self._conn.close()

    def __getattr__(self, name):
        return getattr(self._conn, name)


@contextmanager
def get_db_connection() -> Generator[Any, None, None]:
    """
    Context manager de conexão com o banco de dados.
    Conecta ao Supabase PostgreSQL se configurado.
    Em caso de falha de conexão remota, faz fallback gracioso para SQLite local.
    """
    if PSYCOPG2_AVAILABLE and is_postgres_configured():
        pg_url = get_database_url()
        conn = None
        try:
            conn = psycopg2.connect(pg_url, connect_timeout=10)
        except Exception as pg_err:
            logger.warning(f"Aviso: Não foi possível conectar ao Supabase ({pg_err}). Usando SQLite local.")

        if conn is not None:
            wrapped = PgConnectionWrapper(conn)
            try:
                yield wrapped
                wrapped.commit()
            except Exception:
                wrapped.rollback()
                raise
            finally:
                wrapped.close()
            return

    # Conexão padrão SQLite
    conn = sqlite3.connect(DB_PATH, timeout=30.0)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    conn.execute("PRAGMA journal_mode = WAL")
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def init_db() -> None:
    """Cria tabelas e índices necessários caso não existam e garante a conta Master Admin."""
    with get_db_connection() as conn:
        cursor = conn.cursor()

        # Determina se estamos em PostgreSQL ou SQLite
        is_pg = hasattr(conn, "_conn")

        if is_pg:
            # DDL para PostgreSQL / Supabase
            cursor.execute("""
            CREATE TABLE IF NOT EXISTS draw_results (
                id SERIAL PRIMARY KEY,
                draw_date TEXT NOT NULL,
                slot TEXT NOT NULL,
                lottery TEXT DEFAULT 'RJ',
                day_of_week INTEGER NOT NULL,
                prize_1 TEXT NOT NULL,
                prize_2 TEXT NOT NULL,
                prize_3 TEXT NOT NULL,
                prize_4 TEXT NOT NULL,
                prize_5 TEXT NOT NULL,
                prize_6 TEXT,
                prize_7 TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(draw_date, slot, lottery)
            );
            """)
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_draws_date ON draw_results(draw_date);")
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_draws_slot ON draw_results(slot);")
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_draws_lottery ON draw_results(lottery);")

            cursor.execute("""
            CREATE TABLE IF NOT EXISTS engine_weights (
                id SERIAL PRIMARY KEY,
                name TEXT NOT NULL,
                is_active INTEGER DEFAULT 1,
                weight_frequency_total REAL DEFAULT 15.0,
                weight_frequency_recent REAL DEFAULT 25.0,
                weight_delay REAL DEFAULT 25.0,
                weight_slot_affinity REAL DEFAULT 20.0,
                weight_repetition REAL DEFAULT 10.0,
                weight_day_of_week REAL DEFAULT 5.0,
                recent_decay_rate REAL DEFAULT 0.08,
                top_groups_count INTEGER DEFAULT 5,
                top_tens_count INTEGER DEFAULT 10,
                top_hundreds_count INTEGER DEFAULT 10,
                top_thousands_count INTEGER DEFAULT 10,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
            """)

            cursor.execute("""
            CREATE TABLE IF NOT EXISTS analysis_snapshots (
                id SERIAL PRIMARY KEY,
                target_date TEXT NOT NULL,
                target_slot TEXT NOT NULL,
                lottery TEXT DEFAULT 'RJ',
                tenant_id INTEGER DEFAULT 1,
                status TEXT DEFAULT 'PENDING',
                predictions_json TEXT NOT NULL,
                weights_used_json TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
            """)
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_snapshots_target ON analysis_snapshots(target_date, target_slot);")
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_snapshots_tenant ON analysis_snapshots(tenant_id);")
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_snapshots_lottery ON analysis_snapshots(lottery);")

            cursor.execute("""
            CREATE TABLE IF NOT EXISTS analysis_evaluations (
                id SERIAL PRIMARY KEY,
                snapshot_id INTEGER NOT NULL REFERENCES analysis_snapshots(id) ON DELETE CASCADE,
                draw_id INTEGER NOT NULL REFERENCES draw_results(id) ON DELETE CASCADE,
                evaluated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                acerto_grupo_1 INTEGER DEFAULT 0,
                acertos_grupo_cercado INTEGER DEFAULT 0,
                acerto_dezena_1 INTEGER DEFAULT 0,
                acertos_dezena_cercado INTEGER DEFAULT 0,
                acerto_centena_1 INTEGER DEFAULT 0,
                acertos_centena_cercado INTEGER DEFAULT 0,
                acerto_milhar_1 INTEGER DEFAULT 0,
                acertos_milhar_cercado INTEGER DEFAULT 0,
                hit_rate_score REAL DEFAULT 0.0,
                details_json TEXT NOT NULL,
                UNIQUE(snapshot_id, draw_id)
            );
            """)
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_eval_snapshot ON analysis_evaluations(snapshot_id);")
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_eval_draw ON analysis_evaluations(draw_id);")

            cursor.execute("""
            CREATE TABLE IF NOT EXISTS bichocerto_atrasados (
                group_number INTEGER PRIMARY KEY,
                ranking_pos INTEGER NOT NULL,
                animal_name TEXT NOT NULL,
                delay_text TEXT NOT NULL,
                delay_days INTEGER NOT NULL,
                delay_draws_est INTEGER NOT NULL,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
            """)

            cursor.execute("""
            CREATE TABLE IF NOT EXISTS tenants (
                id SERIAL PRIMARY KEY,
                name TEXT NOT NULL,
                tenant_key TEXT UNIQUE NOT NULL,
                role TEXT DEFAULT 'tester',
                status TEXT DEFAULT 'active',
                notes TEXT,
                expires_at TEXT,
                last_active_at TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
            """)
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_tenants_key ON tenants(tenant_key);")

            cursor.execute("""
            CREATE TABLE IF NOT EXISTS system_settings (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
            """)

            cursor.execute("ALTER TABLE tenants ADD COLUMN IF NOT EXISTS email TEXT;")
            cursor.execute("ALTER TABLE tenants ADD COLUMN IF NOT EXISTS phone TEXT;")
            cursor.execute("ALTER TABLE tenants ADD COLUMN IF NOT EXISTS password TEXT;")
            cursor.execute("ALTER TABLE tenants ADD COLUMN IF NOT EXISTS auth_provider TEXT DEFAULT 'key';")
            cursor.execute("ALTER TABLE tenants ADD COLUMN IF NOT EXISTS trial_started_at TIMESTAMP;")
            cursor.execute("ALTER TABLE tenants ADD COLUMN IF NOT EXISTS trial_expires_at TIMESTAMP;")
            cursor.execute("ALTER TABLE tenants ADD COLUMN IF NOT EXISTS subscription_status TEXT DEFAULT 'active';")
            cursor.execute("ALTER TABLE tenants ADD COLUMN IF NOT EXISTS plan_type TEXT DEFAULT 'free';")
            cursor.execute("ALTER TABLE tenants ADD COLUMN IF NOT EXISTS registration_ip TEXT;")
            cursor.execute("ALTER TABLE tenants ADD COLUMN IF NOT EXISTS last_ip TEXT;")
            cursor.execute("ALTER TABLE tenants ADD COLUMN IF NOT EXISTS device_id TEXT;")
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_tenants_reg_ip ON tenants(registration_ip);")
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_tenants_device_id ON tenants(device_id);")

            # Ativa Row Level Security (RLS) para proteger o acesso direto via Supabase REST API
            for tbl in ["draw_results", "engine_weights", "analysis_snapshots", "analysis_evaluations", "bichocerto_atrasados", "tenants", "system_settings"]:
                cursor.execute(f"ALTER TABLE {tbl} ENABLE ROW LEVEL SECURITY;")


        else:
            # DDL para SQLite
            cursor.execute("""
            CREATE TABLE IF NOT EXISTS draw_results (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                draw_date TEXT NOT NULL,
                slot TEXT NOT NULL,
                day_of_week INTEGER NOT NULL,
                prize_1 TEXT NOT NULL,
                prize_2 TEXT NOT NULL,
                prize_3 TEXT NOT NULL,
                prize_4 TEXT NOT NULL,
                prize_5 TEXT NOT NULL,
                prize_6 TEXT,
                prize_7 TEXT,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(draw_date, slot)
            );
            """)
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_draws_date ON draw_results(draw_date);")
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_draws_slot ON draw_results(slot);")

            cursor.execute("""
            CREATE TABLE IF NOT EXISTS engine_weights (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                is_active INTEGER DEFAULT 1,
                weight_frequency_total REAL DEFAULT 15.0,
                weight_frequency_recent REAL DEFAULT 25.0,
                weight_delay REAL DEFAULT 25.0,
                weight_slot_affinity REAL DEFAULT 20.0,
                weight_repetition REAL DEFAULT 10.0,
                weight_day_of_week REAL DEFAULT 5.0,
                recent_decay_rate REAL DEFAULT 0.08,
                top_groups_count INTEGER DEFAULT 5,
                top_tens_count INTEGER DEFAULT 10,
                top_hundreds_count INTEGER DEFAULT 10,
                top_thousands_count INTEGER DEFAULT 10,
                updated_at TEXT DEFAULT CURRENT_TIMESTAMP
            );
            """)

            cursor.execute("""
            CREATE TABLE IF NOT EXISTS analysis_snapshots (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                target_date TEXT NOT NULL,
                target_slot TEXT NOT NULL,
                status TEXT DEFAULT 'PENDING',
                predictions_json TEXT NOT NULL,
                weights_used_json TEXT NOT NULL,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP
            );
            """)
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_snapshots_target ON analysis_snapshots(target_date, target_slot);")

            cursor.execute("""
            CREATE TABLE IF NOT EXISTS analysis_evaluations (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                snapshot_id INTEGER NOT NULL REFERENCES analysis_snapshots(id) ON DELETE CASCADE,
                draw_id INTEGER NOT NULL REFERENCES draw_results(id) ON DELETE CASCADE,
                evaluated_at TEXT DEFAULT CURRENT_TIMESTAMP,
                acerto_grupo_1 INTEGER DEFAULT 0,
                acertos_grupo_cercado INTEGER DEFAULT 0,
                acerto_dezena_1 INTEGER DEFAULT 0,
                acertos_dezena_cercado INTEGER DEFAULT 0,
                acerto_centena_1 INTEGER DEFAULT 0,
                acertos_centena_cercado INTEGER DEFAULT 0,
                acerto_milhar_1 INTEGER DEFAULT 0,
                acertos_milhar_cercado INTEGER DEFAULT 0,
                hit_rate_score REAL DEFAULT 0.0,
                details_json TEXT NOT NULL,
                UNIQUE(snapshot_id, draw_id)
            );
            """)
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_eval_snapshot ON analysis_evaluations(snapshot_id);")
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_eval_draw ON analysis_evaluations(draw_id);")

            cursor.execute("""
            CREATE TABLE IF NOT EXISTS bichocerto_atrasados (
                group_number INTEGER PRIMARY KEY,
                ranking_pos INTEGER NOT NULL,
                animal_name TEXT NOT NULL,
                delay_text TEXT NOT NULL,
                delay_days INTEGER NOT NULL,
                delay_draws_est INTEGER NOT NULL,
                updated_at TEXT DEFAULT CURRENT_TIMESTAMP
            );
            """)

            cursor.execute("""
            CREATE TABLE IF NOT EXISTS tenants (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                tenant_key TEXT UNIQUE NOT NULL,
                role TEXT DEFAULT 'tester',
                status TEXT DEFAULT 'active',
                notes TEXT,
                expires_at TEXT,
                last_active_at TEXT,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP
            );
            """)
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_tenants_key ON tenants(tenant_key);")

            cursor.execute("PRAGMA table_info(analysis_snapshots)")
            snap_cols = [(col[1] if isinstance(col, tuple) else col["name"]) for col in cursor.fetchall()]
            if "tenant_id" not in snap_cols:
                cursor.execute("ALTER TABLE analysis_snapshots ADD COLUMN tenant_id INTEGER DEFAULT 1")
                cursor.execute("CREATE INDEX IF NOT EXISTS idx_snapshots_tenant ON analysis_snapshots(tenant_id);")

            if "lottery" not in snap_cols:
                cursor.execute("ALTER TABLE analysis_snapshots ADD COLUMN lottery TEXT DEFAULT 'RJ'")
                cursor.execute("CREATE INDEX IF NOT EXISTS idx_snapshots_lottery ON analysis_snapshots(lottery);")

            cursor.execute("PRAGMA table_info(draw_results)")
            draw_cols = [(col[1] if isinstance(col, tuple) else col["name"]) for col in cursor.fetchall()]
            if "lottery" not in draw_cols:
                cursor.execute("ALTER TABLE draw_results ADD COLUMN lottery TEXT DEFAULT 'RJ'")
                cursor.execute("CREATE INDEX IF NOT EXISTS idx_draws_lottery ON draw_results(lottery);")

            cursor.execute("""
            CREATE TABLE IF NOT EXISTS system_settings (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL,
                updated_at TEXT DEFAULT CURRENT_TIMESTAMP
            );
            """)

            cursor.execute("PRAGMA table_info(tenants)")
            tenant_cols = [(col[1] if isinstance(col, tuple) else col["name"]) for col in cursor.fetchall()]
            if "email" not in tenant_cols:
                cursor.execute("ALTER TABLE tenants ADD COLUMN email TEXT")
            if "phone" not in tenant_cols:
                cursor.execute("ALTER TABLE tenants ADD COLUMN phone TEXT")
            if "password" not in tenant_cols:
                cursor.execute("ALTER TABLE tenants ADD COLUMN password TEXT")
            if "auth_provider" not in tenant_cols:
                cursor.execute("ALTER TABLE tenants ADD COLUMN auth_provider TEXT DEFAULT 'key'")
            if "trial_started_at" not in tenant_cols:
                cursor.execute("ALTER TABLE tenants ADD COLUMN trial_started_at TEXT")
            if "trial_expires_at" not in tenant_cols:
                cursor.execute("ALTER TABLE tenants ADD COLUMN trial_expires_at TEXT")
            if "subscription_status" not in tenant_cols:
                cursor.execute("ALTER TABLE tenants ADD COLUMN subscription_status TEXT DEFAULT 'active'")
            if "plan_type" not in tenant_cols:
                cursor.execute("ALTER TABLE tenants ADD COLUMN plan_type TEXT DEFAULT 'free'")
            if "registration_ip" not in tenant_cols:
                cursor.execute("ALTER TABLE tenants ADD COLUMN registration_ip TEXT")
            if "last_ip" not in tenant_cols:
                cursor.execute("ALTER TABLE tenants ADD COLUMN last_ip TEXT")
            if "device_id" not in tenant_cols:
                cursor.execute("ALTER TABLE tenants ADD COLUMN device_id TEXT")

        # Garante que a conta Master Admin k1qvinicius@gmail.com exista com chave 0203040
        cursor.execute("SELECT id FROM tenants WHERE LOWER(COALESCE(email, '')) = 'k1qvinicius@gmail.com' LIMIT 1")
        admin_row = cursor.fetchone()
        if not admin_row:
            cursor.execute("""
            INSERT INTO tenants (name, email, tenant_key, role, status, subscription_status, plan_type, notes)
            VALUES ('Vinicius (Master Admin)', 'k1qvinicius@gmail.com', '0203040', 'admin', 'active', 'active', 'lifetime', 'Conta principal de administração do sistema')
            """)
        else:
            cursor.execute("""
            UPDATE tenants 
            SET tenant_key = '0203040', 
                name = 'Vinicius (Master Admin)', 
                role = 'admin',
                subscription_status = 'active', 
                status = 'active',
                plan_type = 'lifetime'
            WHERE id = ?
            """, (admin_row[0],))

        # Garante que a conta k1qvinicius.cs@gmail.com também seja Master Admin
        cursor.execute("SELECT id FROM tenants WHERE LOWER(COALESCE(email, '')) = 'k1qvinicius.cs@gmail.com' LIMIT 1")
        cs_row = cursor.fetchone()
        if cs_row:
            cursor.execute("""
            UPDATE tenants 
            SET name = 'Kaique Vinicius (Master Admin)', 
                role = 'admin',
                subscription_status = 'active', 
                status = 'active',
                plan_type = 'lifetime'
            WHERE id = ?
            """, (cs_row[0],))

        # Insere configuração de peso padrão se a tabela estiver vazia
        cursor.execute("SELECT COUNT(*) FROM engine_weights")
        count_weights = cursor.fetchone()[0]
        if count_weights == 0:
            cursor.execute("""
            INSERT INTO engine_weights (
                name, is_active,
                weight_frequency_total, weight_frequency_recent,
                weight_delay, weight_slot_affinity,
                weight_repetition, weight_day_of_week,
                recent_decay_rate,
                top_groups_count, top_tens_count, top_hundreds_count, top_thousands_count
            ) VALUES (
                'Quentes do Momento (Alta Assertividade)', 1,
                10.0, 35.0,
                10.0, 25.0,
                20.0, 5.0,
                0.12,
                5, 10, 15, 15
            )
            """)


def get_system_setting(key: str, default: str = "") -> str:
    """Recupera uma configuração do sistema (ex: support_whatsapp, trial_days)."""
    try:
        with get_db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT value FROM system_settings WHERE key = ?", (key,))
            row = cursor.fetchone()
            if row:
                return str(row[0] if not isinstance(row, dict) else row.get("value", default))
    except Exception as e:
        logger.warning(f"Erro ao recuperar setting {key}: {e}")
    return default


def set_system_setting(key: str, value: str) -> bool:
    """Salva ou atualiza uma configuração do sistema."""
    try:
        with get_db_connection() as conn:
            cursor = conn.cursor()
            is_pg = hasattr(conn, "_conn")
            if is_pg:
                cursor.execute("""
                INSERT INTO system_settings (key, value, updated_at)
                VALUES (?, ?, CURRENT_TIMESTAMP)
                ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = CURRENT_TIMESTAMP
                """, (key, str(value)))
            else:
                cursor.execute("""
                INSERT INTO system_settings (key, value, updated_at)
                VALUES (?, ?, CURRENT_TIMESTAMP)
                ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP
                """, (key, str(value)))
            return True
    except Exception as e:
        logger.error(f"Erro ao salvar setting {key}: {e}")
        return False


if __name__ == "__main__":
    init_db()
    active_db = "Supabase PostgreSQL" if is_postgres_configured() else f"SQLite ({DB_PATH})"
    print(f"Banco de dados inicializado com sucesso em: {active_db}")
