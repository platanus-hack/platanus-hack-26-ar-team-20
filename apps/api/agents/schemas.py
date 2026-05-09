from pydantic import BaseModel


class ExperimentRef(BaseModel):
    id: str
    flag_key: str | None = None


class FlagVariant(BaseModel):
    key: str
    rollout_percentage: int
