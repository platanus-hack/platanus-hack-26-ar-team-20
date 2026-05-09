from typing import Any, Literal, Optional

from pydantic import BaseModel, Field, field_validator, model_validator


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


# ---------------------------------------------------------------------------
# Lab
# ---------------------------------------------------------------------------


class LabVariant(BaseModel):
    variant_key: str
    is_control: bool = False
    axis: Optional[str] = None
    hypothesis: str
    implementation_brief: str
    expected_lift_pp: Optional[float] = None


class LabInput(BaseModel):
    interpreted_problem: InterpretedProblem
    context: dict[str, Any] = Field(default_factory=dict)
    constraints: dict[str, Any] = Field(default_factory=dict)


class LabOutput(BaseModel):
    primary_kpi: str
    guardrail_kpis: list[str] = []
    variants: list[LabVariant]
    traffic_split: list[float]
    min_n_per_arm: int = Field(..., ge=1)
    min_observation_days: int = Field(..., ge=7)
    max_observation_days: int = Field(..., ge=7)
    decision_rule: str
    frozen: bool = True
    registered_at: str

    @field_validator("variants")
    @classmethod
    def _variants_size(cls, v: list[LabVariant]) -> list[LabVariant]:
        if not (2 <= len(v) <= 5):
            raise ValueError(
                f"variants must have between 2 and 5 entries, got {len(v)}"
            )
        keys = [x.variant_key for x in v]
        if len(set(keys)) != len(keys):
            raise ValueError(f"variant_keys must be unique, got {keys}")
        controls = [x for x in v if x.is_control]
        if len(controls) != 1:
            raise ValueError(
                f"exactly one variant must be is_control=true, got {len(controls)}"
            )
        return v

    @model_validator(mode="after")
    def _consistency(self) -> "LabOutput":
        if len(self.traffic_split) != len(self.variants):
            raise ValueError(
                f"traffic_split length ({len(self.traffic_split)}) must equal "
                f"variants length ({len(self.variants)})"
            )
        total = sum(self.traffic_split)
        if abs(total - 1.0) > 0.001:
            raise ValueError(
                f"traffic_split must sum to 1.0 (±0.001), got {total:.4f}"
            )
        if self.max_observation_days < self.min_observation_days:
            raise ValueError(
                "max_observation_days must be >= min_observation_days"
            )
        return self


# ---------------------------------------------------------------------------
# Architect
# ---------------------------------------------------------------------------


ArchitectMode = Literal["compose", "consolidate"]


class ArchitectComposeInput(BaseModel):
    experiment_id: str
    design: LabOutput
    variants: list[LabVariant]


class ArchitectComposeOutput(BaseModel):
    pr_url: str
    branch: str
    multivariate_flag_key: str
    variants_implemented: list[str]
    files_changed: list[str] = []
    flag_rollout_pct: int = 30
    demo_mode: bool = False


# ---------------------------------------------------------------------------
# Witness
# ---------------------------------------------------------------------------


WitnessVerdict = Literal[
    "too_early",
    "no_signal",
    "winner",
    "loser",
    "inconclusive",
]


ExperimentVerdict = Literal[
    "too_early",
    "no_signal",
    "ship_winner",
    "extend_top_two",
    "kill_all",
    "inconclusive",
]


class WitnessGuardrailReading(BaseModel):
    kpi: str
    rate: float = 0.0
    rate_vs_control_rel: Optional[float] = None
    breach: bool = False


class WitnessVariantVerdict(BaseModel):
    variant_key: str
    is_control: bool = False
    n: int = 0
    conv: int = 0
    rate: float = 0.0
    p_better_than_control: float = 0.0
    p_is_best: float = 0.0
    guardrails: list[WitnessGuardrailReading] = []
    guardrail_breach: bool = False
    verdict: WitnessVerdict
    rationale: str


class WitnessRecommendedAction(BaseModel):
    action: Literal[
        "ramp_winner_kill_others",
        "kill_variant",
        "extend_top_two",
        "kill_all",
        "wait",
    ]
    flag_key: str
    payload: dict[str, Any] = Field(default_factory=dict)
    rationale: str


class WitnessInput(BaseModel):
    experiment_id: str
    days_live: Optional[int] = None


class WitnessOutput(BaseModel):
    experiment_id: str
    flag_key: str
    primary_kpi: str
    days_live: int
    min_observation_days: int
    n_total: int = 0
    experiment_verdict: ExperimentVerdict
    winning_variant: Optional[str] = None
    variant_verdicts: list[WitnessVariantVerdict] = Field(default_factory=list)
    recommended_actions: list[WitnessRecommendedAction] = Field(default_factory=list)
    narrative: str = ""
    confidence: float = Field(0.0, ge=0.0, le=1.0)


# ---------------------------------------------------------------------------
# Director
# ---------------------------------------------------------------------------


DirectorAction = Literal[
    "ship_winner",
    "kill_variant",
    "extend_top_two",
    "kill_all",
    "schedule_consolidate",
    "wait",
]


class DirectorPolicy(BaseModel):
    risk_tolerance: Literal["conservative", "balanced", "aggressive"] = "balanced"
    max_blast_radius_pct: int = 50
    require_human_approval_above_pct: int = 50
    auto_merge_consolidation: bool = False
    kill_protected_flags: list[str] = Field(default_factory=list)


class DirectorDecision(BaseModel):
    action: DirectorAction
    flag_key: Optional[str] = None
    payload: dict[str, Any] = Field(default_factory=dict)
    before_state: Optional[dict[str, Any]] = None
    after_state: Optional[dict[str, Any]] = None
    rationale: str = ""
    executed: bool = False
    human_required: bool = False
    blocked_by: Optional[str] = None
    reversible_until: Optional[str] = None
    decision_id: Optional[str] = None


class DirectorFollowUp(BaseModel):
    type: Literal["schedule_consolidate", "schedule_recheck", "notify_human"]
    payload: dict[str, Any] = Field(default_factory=dict)


class DirectorInput(BaseModel):
    witness_output: WitnessOutput
    user_policy: Optional[DirectorPolicy] = None


class DirectorOutput(BaseModel):
    experiment_id: str
    decisions: list[DirectorDecision] = Field(default_factory=list)
    follow_ups: list[DirectorFollowUp] = Field(default_factory=list)
    summary_for_human: str = ""
