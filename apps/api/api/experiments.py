from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from agents.brief import BriefAgent
from agents.schemas import BriefInput, BriefOutput
from core.anthropic_client import get_anthropic
from core.supabase_client import get_supabase

router = APIRouter()


def get_brief_agent(
    anthropic=Depends(get_anthropic),
    supabase=Depends(get_supabase),
) -> BriefAgent:
    return BriefAgent(anthropic, supabase)


# ---------------------------------------------------------------------------
# Brief — human entry point
# ---------------------------------------------------------------------------
class BriefRequest(BaseModel):
    org_id: str
    repo_id: str
    human_brief: str


@router.post("/brief", response_model=BriefOutput)
async def run_brief(
    body: BriefRequest,
    agent: BriefAgent = Depends(get_brief_agent),
) -> BriefOutput:
    try:
        return await agent.run(
            BriefInput(
                org_id=body.org_id,
                repo_id=body.repo_id,
                human_brief=body.human_brief,
            ),
            org_id=body.org_id,
        )
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))


@router.post("/{experiment_id}/run")
async def run_experiment(experiment_id: str) -> dict[str, str]:
    return {"experiment_id": experiment_id, "status": "queued"}
