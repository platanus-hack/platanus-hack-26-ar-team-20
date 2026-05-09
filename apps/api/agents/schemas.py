from typing import Literal, Optional

from pydantic import BaseModel


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
