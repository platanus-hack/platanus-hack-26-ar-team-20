from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from agents.brief import BriefAgent
from agents.lab import LabAgent
from agents.schemas import (
    BriefInput,
    BriefOutput,
    InterpretedProblem,
    LabInput,
    LabOutput,
)
from core.anthropic_client import get_anthropic
from core.supabase_client import get_supabase

router = APIRouter()


def get_brief_agent(
    anthropic=Depends(get_anthropic),
    supabase=Depends(get_supabase),
) -> BriefAgent:
    return BriefAgent(anthropic, supabase)


def get_lab_agent(
    anthropic=Depends(get_anthropic),
    supabase=Depends(get_supabase),
) -> LabAgent:
    return LabAgent(anthropic, supabase)


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


# ---------------------------------------------------------------------------
# Lab — multivariate experiment design
# ---------------------------------------------------------------------------
class LabRunRequest(BaseModel):
    problem: InterpretedProblem
    constraints: dict | None = None


@router.post("/{experiment_id}/lab/run", response_model=LabOutput)
async def run_lab(
    experiment_id: str,
    body: LabRunRequest,
    agent: LabAgent = Depends(get_lab_agent),
    supabase=Depends(get_supabase),
) -> LabOutput:
    exp = (
        supabase.table("experiments")
        .select("id, org_id, repo_id")
        .eq("id", experiment_id)
        .limit(1)
        .execute()
        .data
    )
    if not exp:
        raise HTTPException(status_code=404, detail=f"experiment {experiment_id} not found")
    row = exp[0]

    feature_state = (
        supabase.table("feature_state")
        .select("feature_name, status, source_files")
        .eq("repo_id", row["repo_id"])
        .execute()
        .data
        or []
    )
    repo = (
        supabase.table("repos")
        .select("github_repo_full_name, default_branch, flag_provider, analytics_provider")
        .eq("id", row["repo_id"])
        .limit(1)
        .execute()
        .data
        or [{}]
    )[0]

    context = {
        "feature_state": feature_state[:30],
        "stack": (
            f"repo={repo.get('github_repo_full_name')} "
            f"branch={repo.get('default_branch')} "
            f"flags={repo.get('flag_provider')} "
            f"analytics={repo.get('analytics_provider')}"
        ),
    }

    try:
        return await agent.run(
            LabInput(
                interpreted_problem=body.problem,
                context=context,
                constraints=body.constraints or {},
            ),
            org_id=row["org_id"],
            experiment_id=experiment_id,
        )
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))


@router.post("/{experiment_id}/run")
async def run_experiment(experiment_id: str) -> dict[str, str]:
    return {"experiment_id": experiment_id, "status": "queued"}
