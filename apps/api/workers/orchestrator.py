"""End-to-end orchestrator. Stitches the agents together so a single call
walks an experiment from problem to consolidated cleanup PR.

In manual mode, the dashboard is in charge — each step is triggered by a
human button click. In auto mode (demo or future autopilot), this function
chains them with two fast-forwards in between to compress the 14-day
real-world cadence into ~30 seconds.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any, Literal

from pydantic import ValidationError

from agents.architect import ArchitectAgent
from agents.brief import BriefAgent
from agents.director import DirectorAgent
from agents.lab import LabAgent
from agents.schemas import (
    ArchitectComposeInput,
    ArchitectConsolidateInput,
    BriefInput,
    DirectorInput,
    InterpretedProblem,
    LabInput,
    LabOutput,
    LabVariant,
    WitnessInput,
)
from agents.witness import WitnessAgent
from core.config import settings
from core.supabase_client import filter_experiment


OrchestratorMode = Literal["auto", "manual"]


async def fast_forward(
    db,
    experiment_id: str,
    *,
    days: int = 7,
    target: str = "started_at",
) -> dict[str, Any]:
    """In demo mode, time-travel by overwriting the relevant timestamp.

    Returns the row id and new timestamp for logging.
    """
    new_ts = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()
    update: dict[str, Any] = {target: new_ts}

    rows = (
        filter_experiment(db.table("experiments").select("id, status"), experiment_id)
        .limit(1)
        .execute()
        .data
    )
    if not rows:
        raise ValueError(f"experiment {experiment_id} not found")
    row = rows[0]

    if target == "shipped_at" and row["status"] in ("running", "analyzing"):
        update["status"] = "shipped"

    db.table("experiments").update(update).eq("id", row["id"]).execute()
    return {"id": row["id"], target: new_ts}


async def run_full_loop(
    experiment_id: str,
    *,
    org_id: str,
    mode: OrchestratorMode = "manual",
    brief_agent: BriefAgent | None = None,
    lab_agent: LabAgent,
    architect_agent: ArchitectAgent,
    witness_agent: WitnessAgent,
    director_agent: DirectorAgent,
    db,
    human_brief: str | None = None,
) -> dict[str, Any]:
    """Run the full Helix loop for one experiment.

    In manual mode (default) this is a no-op — the UI drives each step.
    In auto mode, it chains Lab → Architect compose → fast-forward →
    Witness → Director → fast-forward → Architect consolidate, skipping
    any step whose output already exists on the experiment row.
    """
    if mode == "manual":
        return {"experiment_id": experiment_id, "status": "manual"}

    log: list[dict[str, Any]] = []

    exp = _fetch_experiment(db, experiment_id)
    exp_row_id: str = exp["id"]

    # Step 0: Brief (only if the experiment has no problem and a brief was
    # provided). Skipped on the standard demo path because the new-experiment
    # page persists the interpreted_problem before this entry point.
    if not exp.get("problem") and human_brief and brief_agent:
        brief_out = await brief_agent.run(
            BriefInput(
                org_id=org_id,
                repo_id=exp["repo_id"],
                human_brief=human_brief,
            ),
            org_id=org_id,
        )
        db.table("experiments").update(
            {"problem": brief_out.interpreted_problem.model_dump()}
        ).eq("id", exp_row_id).execute()
        exp = _fetch_experiment(db, exp_row_id)
        log.append({"step": "brief", "primary_kpi": brief_out.interpreted_problem.primary_kpi})

    # Step 1: Lab — needs problem, produces design+variants.
    if not exp.get("design"):
        problem = InterpretedProblem.model_validate(exp["problem"])
        repo = _fetch_repo(db, exp["repo_id"])
        lab_out = await lab_agent.run(
            LabInput(
                interpreted_problem=problem,
                context={
                    "feature_state": [],
                    "stack": (
                        f"repo={repo.get('github_repo_full_name')} "
                        f"flags={repo.get('flag_provider')} "
                        f"analytics={repo.get('analytics_provider')}"
                    ),
                },
                constraints={},
            ),
            org_id=org_id,
            experiment_id=exp_row_id,
        )
        exp = _fetch_experiment(db, exp_row_id)
        log.append({"step": "lab", "variants": len(lab_out.variants)})

    # Step 2: Architect compose — opens PR + creates PostHog flag.
    if not exp.get("pr_url"):
        design = _design_from_row(exp)
        variants = [LabVariant.model_validate(v) for v in (exp.get("variants") or [])]
        compose_out = await architect_agent.run_compose(
            ArchitectComposeInput(
                experiment_id=exp["experiment_id"],
                design=design,
                variants=variants,
            ),
            org_id=org_id,
            experiment_id=exp_row_id,
        )
        exp = _fetch_experiment(db, exp_row_id)
        log.append({"step": "architect_compose", "pr_url": compose_out.pr_url})

    # Step 3 (demo): fast-forward observation window so Witness sees data.
    if settings.helix_demo_mode:
        ff = await fast_forward(db, exp_row_id, days=7, target="started_at")
        log.append({"step": "fast_forward_started_at", **ff})

    # Step 4: Witness — multi-arm Bayesian read.
    if not exp.get("results"):
        witness_out = await witness_agent.run(
            WitnessInput(experiment_id=exp["experiment_id"]),
            org_id=org_id,
            experiment_id=exp_row_id,
        )
        exp = _fetch_experiment(db, exp_row_id)
        log.append(
            {
                "step": "witness",
                "verdict": witness_out.experiment_verdict,
                "winner": witness_out.winning_variant,
            }
        )

    # Step 5: Director — apply policy, ship winner / kill variants.
    from agents.schemas import WitnessOutput

    if exp.get("status") not in ("shipped", "consolidated"):
        try:
            witness_output = WitnessOutput.model_validate(exp["results"])
        except ValidationError as e:
            raise ValueError(f"witness results corrupt: {e}") from e
        director_out = await director_agent.run(
            DirectorInput(witness_output=witness_output),
            org_id=org_id,
            experiment_id=exp_row_id,
        )
        log.append(
            {
                "step": "director",
                "actions": [d.action for d in director_out.decisions],
                "executed": [d.executed for d in director_out.decisions],
            }
        )

    # Step 6 (demo): fast-forward consolidation grace window.
    if settings.helix_demo_mode:
        ff = await fast_forward(db, exp_row_id, days=7, target="shipped_at")
        log.append({"step": "fast_forward_shipped_at", **ff})

    # Step 7: Architect consolidate — clean up flag + losers + inline winner.
    exp = _fetch_experiment(db, exp_row_id)
    if exp.get("status") != "consolidated" and exp.get("winning_variant"):
        all_variants = [
            v.get("variant_key") for v in (exp.get("variants") or [])
        ]
        winner = exp["winning_variant"]
        losers = [v for v in all_variants if v and v != winner]
        consolidate_out = await architect_agent.run_consolidate(
            ArchitectConsolidateInput(
                experiment_id=exp["experiment_id"],
                winning_variant=winner,
                losing_variants=losers,
                flag_key=exp.get("flag_key") or exp["experiment_id"],
            ),
            org_id=org_id,
            experiment_id=exp_row_id,
        )
        log.append(
            {
                "step": "architect_consolidate",
                "pr_url": consolidate_out.pr_url,
                "files_deleted": len(consolidate_out.files_deleted),
            }
        )

    return {"experiment_id": experiment_id, "status": "auto-completed", "log": log}


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def _fetch_experiment(db, experiment_id: str) -> dict[str, Any]:
    rows = (
        filter_experiment(db.table("experiments").select("id, org_id, repo_id, experiment_id, status, problem, design, "
            "variants, results, pr_url, flag_key, winning_variant, "
            "started_at, shipped_at, consolidated_at"), experiment_id)
        .limit(1)
        .execute()
        .data
    )
    if not rows:
        raise ValueError(f"experiment {experiment_id} not found")
    return rows[0]


def _fetch_repo(db, repo_id: str) -> dict[str, Any]:
    rows = (
        db.table("repos")
        .select("github_repo_full_name, default_branch, flag_provider, analytics_provider")
        .eq("id", repo_id)
        .limit(1)
        .execute()
        .data
        or [{}]
    )
    return rows[0]


def _design_from_row(exp: dict[str, Any]) -> LabOutput:
    design_data = dict(exp["design"])
    design_data["variants"] = exp.get("variants") or design_data.get("variants") or []
    design_data.setdefault("frozen", True)
    design_data.setdefault(
        "registered_at", datetime.now(timezone.utc).isoformat()
    )
    return LabOutput.model_validate(design_data)
