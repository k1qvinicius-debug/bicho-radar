"""
Gerenciamento e persistência dos pesos do motor estatístico.
"""

from typing import Dict, Any
from ..database import get_db_connection
from ..models import WeightsConfigModel


def get_active_weights() -> WeightsConfigModel:
    """Busca a configuração de pesos ativa no banco ou retorna os padrões."""
    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM engine_weights WHERE is_active = 1 ORDER BY id DESC LIMIT 1")
        row = cursor.fetchone()
        if row:
            return WeightsConfigModel(
                id=row["id"],
                name=row["name"],
                is_active=bool(row["is_active"]),
                weight_frequency_total=float(row["weight_frequency_total"]),
                weight_frequency_recent=float(row["weight_frequency_recent"]),
                weight_delay=float(row["weight_delay"]),
                weight_slot_affinity=float(row["weight_slot_affinity"]),
                weight_repetition=float(row["weight_repetition"]),
                weight_day_of_week=float(row["weight_day_of_week"]),
                recent_decay_rate=float(row["recent_decay_rate"]),
                top_groups_count=int(row["top_groups_count"]),
                top_tens_count=int(row["top_tens_count"]),
                top_hundreds_count=int(row["top_hundreds_count"]),
                top_thousands_count=int(row["top_thousands_count"]),
            )

    return WeightsConfigModel()


def update_active_weights(cfg: WeightsConfigModel) -> WeightsConfigModel:
    """Atualiza ou insere nova configuração de pesos."""
    with get_db_connection() as conn:
        cursor = conn.cursor()
        # Desativa outras configurações
        cursor.execute("UPDATE engine_weights SET is_active = 0")
        cursor.execute("""
            INSERT INTO engine_weights (
                name, is_active,
                weight_frequency_total, weight_frequency_recent,
                weight_delay, weight_slot_affinity,
                weight_repetition, weight_day_of_week,
                recent_decay_rate,
                top_groups_count, top_tens_count, top_hundreds_count, top_thousands_count,
                updated_at
            ) VALUES (?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        """, (
            cfg.name,
            cfg.weight_frequency_total,
            cfg.weight_frequency_recent,
            cfg.weight_delay,
            cfg.weight_slot_affinity,
            cfg.weight_repetition,
            cfg.weight_day_of_week,
            cfg.recent_decay_rate,
            cfg.top_groups_count,
            cfg.top_tens_count,
            cfg.top_hundreds_count,
            cfg.top_thousands_count,
        ))
        new_id = cursor.lastrowid
        cfg.id = new_id
        cfg.is_active = True
        return cfg
