"""
Modelos Pydantic para validação e transferência de dados na API.
"""

from pydantic import BaseModel, Field, field_validator
from typing import List, Optional, Dict, Any
from datetime import date
from .domain import format_milhar, get_group_for_number, extract_dezena, extract_centena, extract_milhar, get_animal_info


class DrawResultCreate(BaseModel):
    draw_date: str = Field(..., description="Data do sorteio (YYYY-MM-DD)")
    slot: str = Field(..., description="Horário/extração (ex: PPT, PTM, PT, LK-11, LN-10, FED, etc.)")
    lottery: Optional[str] = Field("RJ", description="Código da loteria (RJ, LOOK, NACIONAL, SP, FEDERAL)")
    prize_1: str = Field(..., description="Milhar do 1º prêmio (4 dígitos)")
    prize_2: str = Field(..., description="Milhar do 2º prêmio (4 dígitos)")
    prize_3: str = Field(..., description="Milhar do 3º prêmio (4 dígitos)")
    prize_4: str = Field(..., description="Milhar do 4º prêmio (4 dígitos)")
    prize_5: str = Field(..., description="Milhar do 5º prêmio (4 dígitos)")
    prize_6: Optional[str] = Field(None, description="Milhar do 6º prêmio (opcional)")
    prize_7: Optional[str] = Field(None, description="Centena ou número do 7º prêmio (opcional)")

    @field_validator("prize_1", "prize_2", "prize_3", "prize_4", "prize_5", mode="before")
    @classmethod
    def validate_prizes(cls, v: Any) -> str:
        s = format_milhar(v)
        if len(s) != 4 or not s.isdigit():
            raise ValueError(f"Prêmio inválido: {v}. Deve conter até 4 dígitos numéricos.")
        return s

    @field_validator("draw_date", mode="before")
    @classmethod
    def validate_date(cls, v: Any) -> str:
        s = str(v).strip()
        parts = s.split("-")
        if len(parts) != 3 or len(parts[0]) != 4:
            raise ValueError(f"Data inválida: {v}. Use o formato YYYY-MM-DD.")
        return s


class DrawResultResponse(BaseModel):
    id: int
    draw_date: str
    slot: str
    lottery: Optional[str] = "RJ"
    day_of_week: int
    prize_1: str
    prize_2: str
    prize_3: str
    prize_4: str
    prize_5: str
    prize_6: Optional[str] = None
    prize_7: Optional[str] = None
    group_1: int
    animal_1: Dict[str, Any]
    groups_1_to_5: List[int]
    prizes_detail: Optional[List[Dict[str, Any]]] = None
    created_at: str

    @classmethod
    def from_row(cls, row: Dict[str, Any]) -> "DrawResultResponse":
        p1 = row["prize_1"]
        g1 = get_group_for_number(p1)
        anim1 = get_animal_info(g1)
        g_all = [
            get_group_for_number(row["prize_1"]),
            get_group_for_number(row["prize_2"]),
            get_group_for_number(row["prize_3"]),
            get_group_for_number(row["prize_4"]),
            get_group_for_number(row["prize_5"]),
        ]

        prizes_detail = []
        p_keys = [
            ("1º", row.get("prize_1")),
            ("2º", row.get("prize_2")),
            ("3º", row.get("prize_3")),
            ("4º", row.get("prize_4")),
            ("5º", row.get("prize_5")),
            ("6º", row.get("prize_6")),
            ("7º", row.get("prize_7")),
        ]
        for idx, (label, val) in enumerate(p_keys, start=1):
            if val:
                s_val = str(val).strip()
                if s_val:
                    grp = get_group_for_number(s_val)
                    anim = get_animal_info(grp)
                    prizes_detail.append({
                        "order": idx,
                        "label": label,
                        "number": s_val,
                        "milhar": s_val[-4:] if len(s_val) >= 4 else s_val,
                        "centena": s_val[-3:] if len(s_val) >= 3 else s_val,
                        "dezena": s_val[-2:] if len(s_val) >= 2 else s_val,
                        "group": grp,
                        "animal_name": anim["name"],
                        "animal_emoji": anim["emoji"],
                        "tens": anim["tens"],
                    })

        return cls(
            id=row["id"],
            draw_date=row["draw_date"],
            slot=row["slot"],
            lottery=row.get("lottery") or "RJ",
            day_of_week=row["day_of_week"],
            prize_1=row["prize_1"],
            prize_2=row["prize_2"],
            prize_3=row["prize_3"],
            prize_4=row["prize_4"],
            prize_5=row["prize_5"],
            prize_6=row.get("prize_6"),
            prize_7=row.get("prize_7"),
            group_1=g1,
            animal_1=anim1,
            groups_1_to_5=g_all,
            prizes_detail=prizes_detail,
            created_at=str(row.get("created_at") or ""),
        )


class WeightsConfigModel(BaseModel):
    id: Optional[int] = None
    name: str = "Quentes do Momento (Alta Assertividade)"
    is_active: bool = True
    weight_frequency_total: float = Field(default=10.0, ge=0.0, le=100.0)
    weight_frequency_recent: float = Field(default=35.0, ge=0.0, le=100.0)
    weight_delay: float = Field(default=10.0, ge=0.0, le=100.0)
    weight_slot_affinity: float = Field(default=25.0, ge=0.0, le=100.0)
    weight_repetition: float = Field(default=20.0, ge=0.0, le=100.0)
    weight_day_of_week: float = Field(default=5.0, ge=0.0, le=100.0)
    recent_decay_rate: float = Field(default=0.12, ge=0.01, le=0.5)
    top_groups_count: int = Field(default=5, ge=1, le=25)
    top_tens_count: int = Field(default=10, ge=1, le=100)
    top_hundreds_count: int = Field(default=15, ge=1, le=100)
    top_thousands_count: int = Field(default=15, ge=1, le=100)


class FactorItem(BaseModel):
    name: str
    description: str
    impact_points: float
    type: str  # 'positive', 'neutral', 'warning'


class RankedItem(BaseModel):
    value: str
    display_name: str
    score: float
    group_number: Optional[int] = None
    animal_name: Optional[str] = None
    animal_emoji: Optional[str] = None
    tens: Optional[List[str]] = None
    factors: List[FactorItem] = []
    metadata: Dict[str, Any] = {}


class PredictionOutput(BaseModel):
    target_date: str
    target_slot: str
    target_slot_name: str
    lottery: Optional[str] = "RJ"
    lottery_name: Optional[str] = "Rio de Janeiro (RJ)"
    weights_summary: Dict[str, float]
    total_draws_analyzed: int
    top_groups: List[RankedItem]
    top_tens: List[RankedItem]
    top_hundreds: List[RankedItem]
    top_thousands: List[RankedItem]
    ddz_combos: Optional[List[Dict[str, Any]]] = None
    strategy: str = "hybrid"
    hybrid_combo: Optional[Dict[str, Any]] = None
    quadrant_summary: Optional[Dict[str, Any]] = None
    transition_data: Optional[Dict[str, Any]] = None
    disclaimer: str = "Análise baseada em padrões estatísticos, frequência e atrasos. Não há garantia de resultados futuros."


class SnapshotCreateRequest(BaseModel):
    target_date: str
    target_slot: str
    lottery: Optional[str] = "RJ"


class EvaluationDetailItem(BaseModel):
    category: str
    predicted_value: str
    actual_1st: str
    actual_1_to_5: List[str]
    hit_1st: bool
    hit_cercado: bool
    points_awarded: float


class SnapshotEvaluationResponse(BaseModel):
    snapshot_id: int
    target_date: str
    target_slot: str
    lottery: Optional[str] = "RJ"
    status: str
    created_at: str
    draw_result: Optional[DrawResultResponse] = None
    evaluated_at: Optional[str] = None
    acerto_grupo_1: int = 0
    acertos_grupo_cercado: int = 0
    acerto_dezena_1: int = 0
    acertos_dezena_cercado: int = 0
    acerto_centena_1: int = 0
    acertos_centena_cercado: int = 0
    acerto_milhar_1: int = 0
    acertos_milhar_cercado: int = 0
    hit_rate_score: float = 0.0
    predictions: Optional[Dict[str, Any]] = None
    details: List[Dict[str, Any]] = []


class PerformanceMetricsSummary(BaseModel):
    total_analyses: int
    evaluated_analyses: int
    pending_analyses: int
    group_1st_hit_rate: float
    group_cercado_hit_rate: float
    ten_1st_hit_rate: float
    ten_cercado_hit_rate: float
    hundred_hit_rate: float
    thousand_hit_rate: float
    by_slot_performance: List[Dict[str, Any]]
    total_draws_in_system: int


class TenantModel(BaseModel):
    id: int
    name: str
    tenant_key: str
    role: str = "tester"
    status: str = "active"
    notes: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    auth_provider: Optional[str] = "key"
    trial_started_at: Optional[str] = None
    trial_expires_at: Optional[str] = None
    subscription_status: Optional[str] = "active"
    plan_type: Optional[str] = "free"
    expires_at: Optional[str] = None
    last_active_at: Optional[str] = None
    created_at: Optional[str] = None
    snapshots_count: int = 0
    trial_days_remaining: Optional[int] = None


class TenantCreateModel(BaseModel):
    name: str
    tenant_key: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    role: str = "tester"
    notes: Optional[str] = None
    expires_at: Optional[str] = None
    subscription_status: Optional[str] = "trial"


class TenantUpdateModel(BaseModel):
    name: Optional[str] = None
    phone: Optional[str] = None
    status: Optional[str] = None
    notes: Optional[str] = None
    expires_at: Optional[str] = None
    subscription_status: Optional[str] = None
    plan_type: Optional[str] = None


class SystemSettingsModel(BaseModel):
    support_whatsapp: Optional[str] = ""
    trial_days: Optional[int] = 5
    app_name: Optional[str] = "Bicho Master Pro"
    google_client_id: Optional[str] = ""
    plan_link_monthly: Optional[str] = ""
    plan_link_quarterly: Optional[str] = ""
    plan_link_semiannual: Optional[str] = ""
    plan_link_yearly: Optional[str] = ""
    plan_link_lifetime: Optional[str] = ""


class LoginRequestModel(BaseModel):
    key: Optional[str] = None
    username: Optional[str] = None
    password: Optional[str] = None
    credential: Optional[str] = None
    email: Optional[str] = None
    name: Optional[str] = None
    phone: Optional[str] = None


class RegisterRequestModel(BaseModel):
    name: str = Field(..., description="Nome completo do usuário")
    email: str = Field(..., description="E-mail ou Gmail do usuário")
    phone: Optional[str] = Field(None, description="Número de WhatsApp com DDD")
    password: str = Field(..., description="Senha de acesso à plataforma")


class LoginResponseModel(BaseModel):
    token: str
    tenant: Dict[str, Any]

