from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ValidationError

from agents.architect import ArchitectAgent
from agents.brief import BriefAgent
from agents.lab import LabAgent
from agents.schemas import (
    ArchitectComposeInput,
    ArchitectComposeOutput,
    BriefInput,
    BriefOutput,
    InterpretedProblem,
    LabInput,
    LabOutput,
    LabVariant,
    WitnessInput,
    WitnessOutput,
)
from agents.witness import WitnessAgent
from core.anthropic_client import get_anthropic
from core.config import settings
from core.github_client import GitHubClient
from core.posthog_client import PostHogClient
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


def get_github() -> GitHubClient:
    return GitHubClient(settings)


def get_posthog() -> PostHogClient:
    return PostHogClient(settings)


def get_architect_agent(
    anthropic=Depends(get_anthropic),
    supabase=Depends(get_supabase),
    github: GitHubClient = Depends(get_github),
    posthog: PostHogClient = Depends(get_posthog),
) -> ArchitectAgent:
    return ArchitectAgent(anthropic, supabase, github, posthog)


def get_witness_agent(
    anthropic=Depends(get_anthropic),
    supabase=Depends(get_supabase),
    posthog: PostHogClient = Depends(get_posthog),
) -> WitnessAgent:
    return WitnessAgent(anthropic, supabase, posthog)


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


# ---------------------------------------------------------------------------
# Architect — compose a multivariate PR + PostHog flag
# ---------------------------------------------------------------------------
@router.post(
    "/{experiment_id}/architect/compose",
    response_model=ArchitectComposeOutput,
)
async def architect_compose(
    experiment_id: str,
    agent: ArchitectAgent = Depends(get_architect_agent),
    supabase=Depends(get_supabase),
) -> ArchitectComposeOutput:
    rows = (
        supabase.table("experiments")
        .select("id, org_id, experiment_id, design, variants")
        .eq("id", experiment_id)
        .limit(1)
        .execute()
        .data
    )
    if not rows:
        raise HTTPException(
            status_code=404, detail=f"experiment {experiment_id} not found"
        )
    row = rows[0]
    if not row.get("design"):
        raise HTTPException(
            status_code=409,
            detail="experiment has no design yet — run /lab/run first",
        )

    design_data = dict(row["design"])
    variants_raw = row.get("variants") or design_data.get("variants") or []
    design_data["variants"] = variants_raw
    design_data.setdefault("frozen", True)
    design_data.setdefault(
        "registered_at", datetime.now(timezone.utc).isoformat()
    )

    try:
        design = LabOutput.model_validate(design_data)
        variants = [LabVariant.model_validate(v) for v in variants_raw]
    except ValidationError as e:
        raise HTTPException(
            status_code=422, detail=f"corrupt experiment design: {e}"
        )

    try:
        return await agent.run_compose(
            ArchitectComposeInput(
                experiment_id=row["experiment_id"],
                design=design,
                variants=variants,
            ),
            org_id=row["org_id"],
            experiment_id=experiment_id,
        )
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except NotImplementedError as e:
        raise HTTPException(status_code=501, detail=str(e))


# ---------------------------------------------------------------------------
# Witness — read-side analysis of a running experiment
# ---------------------------------------------------------------------------
class WitnessRunRequest(BaseModel):
    days_live: int | None = None


@router.post("/{experiment_id}/witness/run", response_model=WitnessOutput)
async def witness_run(
    experiment_id: str,
    body: WitnessRunRequest | None = None,
    agent: WitnessAgent = Depends(get_witness_agent),
    supabase=Depends(get_supabase),
) -> WitnessOutput:
    rows = (
        supabase.table("experiments")
        .select("id, org_id, experiment_id")
        .or_(f"id.eq.{experiment_id},experiment_id.eq.{experiment_id}")
        .limit(1)
        .execute()
        .data
    )
    if not rows:
        raise HTTPException(
            status_code=404, detail=f"experiment {experiment_id} not found"
        )
    row = rows[0]
    try:
        return await agent.run(
            WitnessInput(
                experiment_id=row["experiment_id"],
                days_live=body.days_live if body else None,
            ),
            org_id=row["org_id"],
            experiment_id=row["id"],
        )
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))


@router.post("/{experiment_id}/run")
async def run_experiment(experiment_id: str) -> dict[str, str]:
    return {"experiment_id": experiment_id, "status": "queued"}
