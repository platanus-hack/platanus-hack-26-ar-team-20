from abc import ABC, abstractmethod
from pathlib import Path

from anthropic import AsyncAnthropic
from pydantic import BaseModel


class AgentInput(BaseModel):
    pass


class AgentOutput(BaseModel):
    pass


class BaseAgent(ABC):
    name: str
    model: str

    def __init__(self, anthropic_client: AsyncAnthropic, supabase_client):
        self.client = anthropic_client
        self.db = supabase_client

    @abstractmethod
    async def run(
        self,
        input_data: AgentInput,
        *,
        org_id: str,
        experiment_id: str | None = None,
    ) -> AgentOutput: ...

    async def _audit(
        self,
        *,
        org_id: str,
        experiment_id: str | None,
        input_data,
        output_data,
        tokens_in: int,
        tokens_out: int,
        duration_ms: int,
        status: str = "success",
        error: str | None = None,
    ) -> None:
        cost = self._compute_cost(tokens_in, tokens_out)
        self.db.table("agent_runs").insert(
            {
                "org_id": org_id,
                "experiment_id": experiment_id,
                "agent": self.name,
                "model": self.model,
                "input": (
                    input_data.model_dump()
                    if isinstance(input_data, BaseModel)
                    else input_data
                ),
                "output": (
                    output_data.model_dump()
                    if isinstance(output_data, BaseModel)
                    else output_data
                ),
                "tokens_in": tokens_in,
                "tokens_out": tokens_out,
                "cost_usd": cost,
                "duration_ms": duration_ms,
                "status": status,
                "error": error,
            }
        ).execute()

    def _compute_cost(self, tokens_in: int, tokens_out: int) -> float:
        # Sonnet 4.6: $3/M in, $15/M out
        return tokens_in * 3 / 1_000_000 + tokens_out * 15 / 1_000_000

    def _load_prompt(self) -> str:
        # apps/api/agents/base.py -> parents[3] = repo root
        p = Path(__file__).parents[3] / "packages" / "prompts" / f"{self.name}.md"
        return p.read_text()
