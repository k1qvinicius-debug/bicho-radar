"""
Camada de Banco de Dados SQLite para o Bicho Analytics.
Gerencia conexo, inicializao de tabelas, migraes e transaes.
"""

import sqlite3
import os
import json
from contextlib import contextmanager
from typing import Generator

DB_PATH = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "bicho_analytics.db")


def get_db_path() -> str:
    return DB_PATH


@contextmanager
def get_db_connection() -> Generator[sqlite3.Connection, None, None]:
    """Context manager para conexão SQLite com row_factory ativado e modo WAL."""
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
    """Cria tabelas e ndices necessrios caso no existam."""
    with get_db_connection() as conn:
        cursor = conn.cursor()

        # 1. Tabela de Resultados de Sorteios
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

        # 2. Tabela de Configuraes de Pesos do Motor Estatstico
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

        # 3. Tabela de Snapshots de Análises Salvas
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

        # 4. Tabela de Avaliações e Auditoria de Desempenho
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

        # 5. Tabela de Atrasados Oficiais do Bicho Certo (RJ)
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

        # 6. Tabela de Tenants / Testadores / Administradores
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

        # Migração: Adiciona tenant_id em analysis_snapshots se não existir
        cursor.execute("PRAGMA table_info(analysis_snapshots)")
        snap_cols = [col["name"] for col in cursor.fetchall()]
        if "tenant_id" not in snap_cols:
            cursor.execute("ALTER TABLE analysis_snapshots ADD COLUMN tenant_id INTEGER DEFAULT 1")
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_snapshots_tenant ON analysis_snapshots(tenant_id);")

        # Migração: Adiciona lottery em analysis_snapshots se não existir
        if "lottery" not in snap_cols:
            cursor.execute("ALTER TABLE analysis_snapshots ADD COLUMN lottery TEXT DEFAULT 'RJ'")
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_snapshots_lottery ON analysis_snapshots(lottery);")

        # Migração: Adiciona lottery em draw_results se não existir
        cursor.execute("PRAGMA table_info(draw_results)")
        draw_cols = [col["name"] for col in cursor.fetchall()]
        if "lottery" not in draw_cols:
            cursor.execute("ALTER TABLE draw_results ADD COLUMN lottery TEXT DEFAULT 'RJ'")
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_draws_lottery ON draw_results(lottery);")

        # Garante que a conta Master Admin exista com a chave solicitada (0203040)
        cursor.execute("SELECT id FROM tenants WHERE role = 'admin'")
        admin_row = cursor.fetchone()
        if not admin_row:
            cursor.execute("""
            INSERT INTO tenants (name, tenant_key, role, status, notes)
            VALUES ('K. Vinicius (KVS)', '0203040', 'admin', 'active', 'Conta principal de administração do sistema')
            """)
        else:
            cursor.execute("""
            UPDATE tenants SET tenant_key = '0203040', name = 'K. Vinicius (KVS)' WHERE role = 'admin'
            """)

        # Insere configuração de peso padrão se tabela estiver vazia
        cursor.execute("SELECT COUNT(*) FROM engine_weights")
        if cursor.fetchone()[0] == 0:
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
        else:
            # Atualiza para a calibragem otimizada de Quentes do Momento
            cursor.execute("""
            UPDATE engine_weights SET
                name = 'Quentes do Momento (Alta Assertividade)',
                weight_frequency_total = 10.0,
                weight_frequency_recent = 35.0,
                weight_delay = 10.0,
                weight_slot_affinity = 25.0,
                weight_repetition = 20.0,
                weight_day_of_week = 5.0,
                recent_decay_rate = 0.12,
                top_hundreds_count = 15,
                top_thousands_count = 15
            WHERE is_active = 1 AND name LIKE '%Padrão%'
            """)


if __name__ == "__main__":
    init_db()
    print("Banco de dados inicializado com sucesso em:", DB_PATH)
