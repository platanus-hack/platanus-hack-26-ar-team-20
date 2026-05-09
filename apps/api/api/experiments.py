import re
import secrets
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ValidationError

from agents.architect import ArchitectAgent
from agents.brief import BriefAgent
from agents.director import DirectorAgent
from agents.lab import LabAgent
from agents.schemas import (
    ArchitectComposeInput,
    ArchitectComposeOutput,
    ArchitectConsolidateInput,
    ArchitectConsolidateOutput,
    BriefInput,
    BriefOutput,
    DirectorInput,
    DirectorOutput,
    DirectorPolicy,
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
from core.supabase_client import filter_experiment, get_supabase

router = APIRouter()


# Pomelo demo defaults — used when the caller doesn't pass org_id/repo_id.
DEMO_ORG_ID = "00000000-0000-0000-0000-000000000001"
DEMO_REPO_ID = "00000000-0000-0000-0000-000000000010"


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


def get_director_agent(
    anthropic=Depends(get_anthropic),
    supabase=Depends(get_supabase),
    posthog: PostHogClient = Depends(get_posthog),
) -> DirectorAgent:
    return DirectorAgent(anthropic, supabase, posthog)


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
    problem: InterpretedProblem | None = None
    constraints: dict | None = None


@router.post("/{experiment_id}/lab/run", response_model=LabOutput)
async def run_lab(
    experiment_id: str,
    body: LabRunRequest | None = None,
    agent: LabAgent = Depends(get_lab_agent),
    supabase=Depends(get_supabase),
) -> LabOutput:
    exp = (
        filter_experiment(supabase.table("experiments").select("id, org_id, repo_id, problem"), experiment_id)
        .limit(1)
        .execute()
        .data
    )
    if not exp:
        raise HTTPException(status_code=404, detail=f"experiment {experiment_id} not found")
    row = exp[0]

    problem = body.problem if body else None
    if problem is None:
        raw_problem = row.get("problem")
        if not raw_problem:
            raise HTTPException(
                status_code=409,
                detail="experiment has no problem yet — run /experiments/brief first",
            )
        try:
            problem = InterpretedProblem.model_validate(raw_problem)
        except ValidationError as e:
            raise HTTPException(
                status_code=422, detail=f"corrupt experiment problem: {e}"
            )

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
                interpreted_problem=problem,
                context=context,
                constraints=(body.constraints if body else None) or {},
            ),
            org_id=row["org_id"],
            experiment_id=row["id"],
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
        filter_experiment(supabase.table("experiments").select("id, org_id, experiment_id, design, variants"), experiment_id)
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
            experiment_id=row["id"],
        )
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except NotImplementedError as e:
        raise HTTPException(status_code=501, detail=str(e))


# ---------------------------------------------------------------------------
# Architect — consolidate a shipped experiment into zero-debt code
# ---------------------------------------------------------------------------
class ArchitectConsolidateRequest(BaseModel):
    winning_variant: str | None = None
    losing_variants: list[str] | None = None
    flag_key: str | None = None


@router.post(
    "/{experiment_id}/architect/consolidate",
    response_model=ArchitectConsolidateOutput,
)
async def architect_consolidate(
    experiment_id: str,
    body: ArchitectConsolidateRequest | None = None,
    agent: ArchitectAgent = Depends(get_architect_agent),
    supabase=Depends(get_supabase),
) -> ArchitectConsolidateOutput:
    rows = (
        filter_experiment(supabase.table("experiments").select("id, org_id, experiment_id, flag_key, variants, "
            "winning_variant, status"), experiment_id)
        .limit(1)
        .execute()
        .data
    )
    if not rows:
        raise HTTPException(
            status_code=404, detail=f"experiment {experiment_id} not found"
        )
    row = rows[0]

    winner = (body.winning_variant if body else None) or row.get(
        "winning_variant"
    )
    flag_key = (body.flag_key if body else None) or row.get("flag_key")
    if not winner:
        raise HTTPException(
            status_code=409,
            detail="experiment has no winning_variant — run /witness/run first",
        )
    if not flag_key:
        raise HTTPException(
            status_code=409,
            detail="experiment has no flag_key — was it ever composed?",
        )

    if body and body.losing_variants is not None:
        losers = list(body.losing_variants)
    else:
        all_variants = [
            v.get("variant_key") for v in (row.get("variants") or [])
        ]
        losers = [v for v in all_variants if v and v != winner]

    try:
        return await agent.run_consolidate(
            ArchitectConsolidateInput(
                experiment_id=row["experiment_id"],
                winning_variant=winner,
                losing_variants=losers,
                flag_key=flag_key,
            ),
            org_id=row["org_id"],
            experiment_id=row["id"],
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
        filter_experiment(supabase.table("experiments").select("id, org_id, experiment_id"), experiment_id)
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


# ---------------------------------------------------------------------------
# Director — applies policy, executes against PostHog, writes decisions
# ---------------------------------------------------------------------------
class DirectorRunRequest(BaseModel):
    user_policy: DirectorPolicy | None = None


@router.post("/{experiment_id}/director/run", response_model=DirectorOutput)
async def director_run(
    experiment_id: str,
    body: DirectorRunRequest | None = None,
    witness: WitnessAgent = Depends(get_witness_agent),
    director: DirectorAgent = Depends(get_director_agent),
    supabase=Depends(get_supabase),
) -> DirectorOutput:
    rows = (
        filter_experiment(supabase.table("experiments").select("id, org_id, experiment_id, results"), experiment_id)
        .limit(1)
        .execute()
        .data
    )
    if not rows:
        raise HTTPException(
            status_code=404, detail=f"experiment {experiment_id} not found"
        )
    row = rows[0]

    witness_payload = row.get("results")
    if witness_payload:
        try:
            witness_output = WitnessOutput.model_validate(witness_payload)
        except ValidationError:
            witness_output = await witness.run(
                WitnessInput(experiment_id=row["experiment_id"]),
                org_id=row["org_id"],
                experiment_id=row["id"],
            )
    else:
        witness_output = await witness.run(
            WitnessInput(experiment_id=row["experiment_id"]),
            org_id=row["org_id"],
            experiment_id=row["id"],
        )

    try:
        return await director.run(
            DirectorInput(
                witness_output=witness_output,
                user_policy=body.user_policy if body else None,
            ),
            org_id=row["org_id"],
            experiment_id=row["id"],
        )
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))


@router.post("/{experiment_id}/run")
async def run_experiment(experiment_id: str) -> dict[str, str]:
    return {"experiment_id": experiment_id, "status": "queued"}


# ---------------------------------------------------------------------------
# Create a new experiment row from a Brief-shaped problem
# ---------------------------------------------------------------------------
class CreateExperimentRequest(BaseModel):
    problem: InterpretedProblem
    org_id: str | None = None
    repo_id: str | None = None
    experiment_id: str | None = None  # optional caller-supplied slug
    source: str = "human_brief"


@router.post("")
async def create_experiment(
    body: CreateExperimentRequest,
    supabase=Depends(get_supabase),
) -> dict[str, str]:
    org_id = body.org_id or DEMO_ORG_ID
    repo_id = body.repo_id or DEMO_REPO_ID

    if body.experiment_id:
        slug = body.experiment_id
    else:
        surface = body.problem.surface_area or body.problem.type or "new"
        normalized = re.sub(r"[^a-z0-9]+", "_", surface.lower()).strip("_")[:24]
        slug = f"exp_{normalized or 'new'}_{secrets.token_hex(3)}"

    inserted = (
        supabase.table("experiments")
        .insert(
            {
                "org_id": org_id,
                "repo_id": repo_id,
                "experiment_id": slug,
                "source": body.source,
                "problem": body.problem.model_dump(),
                "status": "designing",
            }
        )
        .execute()
        .data
    )
    if not inserted:
        raise HTTPException(status_code=500, detail="failed to insert experiment")
    row = inserted[0]
    return {"id": row["id"], "experiment_id": row["experiment_id"]}


# ---------------------------------------------------------------------------
# Demo helper — fast-forward an experiment so Witness will consider it ripe
# ---------------------------------------------------------------------------
class FastForwardRequest(BaseModel):
    days: int = 8


@router.post("/{experiment_id}/fast-forward")
async def fast_forward(
    experiment_id: str,
    body: FastForwardRequest | None = None,
    supabase=Depends(get_supabase),
) -> dict[str, str]:
    if not settings.helix_fast_forward_enabled:
        raise HTTPException(
            status_code=403, detail="HELIX_FAST_FORWARD_ENABLED is false"
        )

    rows = (
        filter_experiment(supabase.table("experiments").select("id, status, started_at"), experiment_id)
        .limit(1)
        .execute()
        .data
    )
    if not rows:
        raise HTTPException(
            status_code=404, detail=f"experiment {experiment_id} not found"
        )
    row = rows[0]
    if row["status"] != "running":
        raise HTTPException(
            status_code=409,
            detail=(
                f"experiment status is '{row['status']}', "
                "fast-forward only valid in 'running'"
            ),
        )

    days = (body.days if body else None) or 8
    new_started_at = datetime.now(timezone.utc).timestamp() - days * 86400
    iso = datetime.fromtimestamp(new_started_at, tz=timezone.utc).isoformat()
    supabase.table("experiments").update({"started_at": iso}).eq(
        "id", row["id"]
    ).execute()
    return {"experiment_id": experiment_id, "started_at": iso, "days": str(days)}
