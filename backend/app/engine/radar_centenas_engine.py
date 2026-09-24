"""
Módulo do Radar de Centenas (Algoritmo Matemático da Data).
Calcula as 4 milhares e centenas econômicas a partir da data do dia.
"""

from typing import Dict, Any, Optional
from .centena_master_engine import calculate_centena_master


def calculate_radar_centenas(target_date: Optional[str] = None, lottery: str = "RJ") -> Dict[str, Any]:
    return calculate_centena_master(target_date=target_date, lottery=lottery)
