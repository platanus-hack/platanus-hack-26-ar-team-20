from typing import Literal, Optional

from pydantic import BaseModel, Field


class ExperimentRef(BaseModel):
    id: str
    flag_key: str | None = None


class FlagVariant(BaseModel):
    key: str
    rollout_percentage: int


# ---------------------------------------------------------------------------
# Indexer
# ---------------------------------------------------------------------------

FeatureStatus = Literal[
    "behind_flag",
    "shipped",
    "shipped_and_consolidated",
    "killed",
    "proposed",
    "orphan_flag",
    "graduated_flag",
]


class DetectedFeature(BaseModel):
    feature_name: str
    flag_key: Optional[str] = None
    status: FeatureStatus
    rollout_pct: float = 0.0
    source_files: list[str] = []
    description: Optional[str] = None


class IndexerDelta(BaseModel):
    added: list[DetectedFeature] = []
    modified: list[DetectedFeature] = []
    removed: list[DetectedFeature] = []


class IndexerAlert(BaseModel):
    kind: Literal["orphan_flag", "graduated_flag", "suspicious_pattern"]
    flag_key: Optional[str] = None
    feature_name: Optional[str] = None
    message: str


class IndexerStats(BaseModel):
    features_total: int
    flags_referenced: int
    scan_duration_ms: int
    files_scanned: int


class IndexerInput(BaseModel):
    repo_id: str
    repo_full_name: str
    since_sha: Optional[str] = None


class IndexerOutput(BaseModel):
    delta: IndexerDelta
    alerts: list[IndexerAlert] = []
    stats: IndexerStats


# ---------------------------------------------------------------------------
# Shared problem schema (Brief output / Pulse output / Lab input)
# ---------------------------------------------------------------------------

ProblemType = Literal[
    "funnel_leak",
    "activation_drop",
    "retention_drop",
    "monetization_gap",
    "engagement_drop",
    "support_load",
    "other",
]


class InterpretedProblem(BaseModel):
    type: ProblemType
    surface_area: str
    description: str
    primary_kpi: str
    current_value: Optional[float] = None
    target_lift_pp: float = 5.0
    guardrail_kpis: list[str] = []


# ---------------------------------------------------------------------------
# Brief
# ---------------------------------------------------------------------------


class BriefInput(BaseModel):
    org_id: str
    repo_id: str
    human_brief: str


class BriefOutput(BaseModel):
    interpreted_problem: InterpretedProblem
    needs_clarification: bool = False
    clarification_options: list[str] = []
    confidence: float = Field(0.0, ge=0.0, le=1.0)
    notes: Optional[str] = None
