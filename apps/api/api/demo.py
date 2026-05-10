"""Demo helpers: reset state and time-travel timestamps so the
five-step flow can be replayed end-to-end in seconds instead of weeks.

These endpoints rely on supabase service-role access (RLS bypassed)
and are gated behind HELIX_FAST_FORWARD_ENABLED.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from api.experiments import DEMO_ORG_ID
from core.config import settings
from core.supabase_client import filter_experiment, get_supabase

router = APIRouter()


SEED_EXPERIMENT_SLUG = "exp_cart_conv_2026"
# Slugs for any historical / seeded experiments that should survive a reset
# (e.g. the already-shipped showcase experiment loaded by seed.sql). The
# active demo experiment is the one in SEED_EXPERIMENT_SLUG; the rest just
# need to remain intact so the dashboard keeps something to click into.
SEED_EXPERIMENT_SLUGS = [
    "exp_cart_conv_2026",
    "exp_search_relevance_2025",
]

# The seed experiment ships with the original Team20 problem, design, and
# variants pre-loaded — see infra/supabase/seed.sql. Reset rehydrates it
# so the verify-demo flow can replay end-to-end without recreating the
# row (the demo repo only has variant files committed under
# helix/exp_cart_conv_2026, so a fresh slug would fail at compose).
SEED_PROBLEM = {
    "type": "funnel_leak",
    "surface_area": "cart_checkout_flow",
    "description": (
        "Aumentar la conversion cart->checkout para usuarios logueados con "
        "productos en el carrito"
    ),
    "primary_kpi": "cart_to_checkout_rate",
    "current_value": 0.41,
    "target_lift_pp": 5,
    "guardrail_kpis": ["aov", "refund_rate_30d", "support_tickets_per_user_7d"],
}
SEED_DESIGN = {
    "primary_kpi": "cart_to_checkout_rate",
    "guardrail_kpis": ["aov", "refund_rate_30d", "support_tickets_per_user_7d"],
    "traffic_split": [0.25, 0.25, 0.25, 0.25],
    "min_n_per_arm": 1260,
    "min_observation_days": 7,
    "max_observation_days": 14,
    "decision_rule": (
        "Bayesian Thompson sampling. Winner declared when "
        "p(best > control) > 0.95 AND no guardrail breach."
    ),
}
SEED_VARIANTS = [
    {
        "variant_key": "control",
        "is_control": True,
        "hypothesis": "Status quo",
        "implementation_brief": "No changes",
    },
    {
        "variant_key": "recently_seen",
        "axis": "recall",
        "hypothesis": (
            "Mostrar 3 ultimos productos vistos arriba del cart sube +9pp "
            "la conversion"
        ),
        "implementation_brief": (
            "Componente que lee historial y renderea 3 cards"
        ),
        "expected_lift_pp": 9,
    },
    {
        "variant_key": "similar_offer",
        "axis": "cross_sell",
        "hypothesis": (
            "Ofertas de productos similares al del cart suben la AOV y la "
            "conversion"
        ),
        "implementation_brief": (
            "Componente que llama recomendador y muestra ofertas"
        ),
        "expected_lift_pp": 4,
    },
    {
        "variant_key": "urgency_timer",
        "axis": "urgency",
        "hypothesis": (
            "Banner de urgency sube la conversion a corto plazo"
        ),
        "implementation_brief": "Banner con countdown 15min",
        "expected_lift_pp": 6,
    },
]

FastForwardTarget = Literal["started_at", "shipped_at", "consolidated_at"]


def _require_demo_mode() -> None:
    if not settings.helix_fast_forward_enabled:
        raise HTTPException(
            status_code=403, detail="HELIX_FAST_FORWARD_ENABLED is false"
        )


# ---------------------------------------------------------------------------
# Fast-forward — bump a timestamp into the past so the next agent in the
# loop considers the experiment ripe (no real wall-clock waiting).
# ---------------------------------------------------------------------------
class FastForwardBody(BaseModel):
    days: int | None = None
    target: FastForwardTarget | None = None


@router.post("/fast-forward/{experiment_id}")
async def fast_forward(
    experiment_id: str,
    body: FastForwardBody | None = None,
    target: FastForwardTarget | None = Query(default=None),
    days: int | None = Query(default=None),
    supabase=Depends(get_supabase),
) -> dict:
    _require_demo_mode()

    final_target: FastForwardTarget = (
        target or (body.target if body else None) or "started_at"
    )
    final_days = days or (body.days if body else None) or 7

    rows = (
        filter_experiment(
            supabase.table("experiments").select(
                "id, experiment_id, status, started_at, shipped_at, consolidated_at"
            ),
            experiment_id,
        )
        .limit(1)
        .execute()
        .data
    )
    if not rows:
        raise HTTPException(
            status_code=404, detail=f"experiment {experiment_id} not found"
        )
    row = rows[0]

    new_ts = (datetime.now(timezone.utc) - timedelta(days=final_days)).isoformat()
    update: dict[str, str] = {final_target: new_ts}

    # Light coupling: when we fast-forward shipped_at on an experiment that
    # hasn't been formally moved to 'shipped' status yet (Director ships in
    # PostHog but doesn't flip the column), we set the column too — otherwise
    # the architect/consolidate path that reads winning_variant from analyzing
    # state still works, but the lifecycle is incoherent.
    if final_target == "shipped_at" and row["status"] in (
        "running",
        "analyzing",
    ):
        update["status"] = "shipped"

    supabase.table("experiments").update(update).eq("id", row["id"]).execute()

    return {
        "experiment_id": row["experiment_id"],
        "id": row["id"],
        "target": final_target,
        "days": final_days,
        final_target: new_ts,
    }


# ---------------------------------------------------------------------------
# Reset — wipe agent_runs + decisions + extra experiments so the demo can
# be replayed against a clean slate. The Team20 seed experiment is
# restored to the same shape it has after seed.sql.
# ---------------------------------------------------------------------------
@router.post("/reset")
async def reset_demo(supabase=Depends(get_supabase)) -> dict:
    _require_demo_mode()

    # Wipe derived state for the active demo experiment only. We need to
    # leave the seeded historical experiments (and their decisions /
    # agent_runs) intact so the dashboard always has something finished to
    # click into.
    cart_rows = (
        supabase.table("experiments")
        .select("id")
        .eq("org_id", DEMO_ORG_ID)
        .eq("experiment_id", SEED_EXPERIMENT_SLUG)
        .execute()
        .data
        or []
    )
    cart_id = cart_rows[0]["id"] if cart_rows else None
    if cart_id is not None:
        supabase.table("agent_runs").delete().eq(
            "experiment_id", cart_id
        ).execute()
        supabase.table("decisions").delete().eq(
            "experiment_id", cart_id
        ).execute()

    # Drop ad-hoc experiments created by `/experiments` POST or the verify
    # script — preserve every slug we seed in seed.sql.
    supabase.table("experiments").delete().eq("org_id", DEMO_ORG_ID).not_.in_(
        "experiment_id", SEED_EXPERIMENT_SLUGS
    ).execute()

    # Restore the seed experiment to a clean post-seed.sql shape so the
    # full Brief→Lab→Compose→Witness→Director→Consolidate loop can replay.
    # Problem + design + variants come back populated so Lab can reuse them
    # (or overwrite them with a fresh run); the rest is cleared.
    seed_update = {
        "status": "designing",
        "problem": SEED_PROBLEM,
        "design": SEED_DESIGN,
        "variants": SEED_VARIANTS,
        "started_at": None,
        "results": None,
        "winning_variant": None,
        "pr_url": None,
        "flag_key": None,
        "shipped_at": None,
        "consolidated_at": None,
    }
    supabase.table("experiments").update(seed_update).eq(
        "experiment_id", SEED_EXPERIMENT_SLUG
    ).execute()

    return {
        "ok": True,
        "seed_experiment_id": SEED_EXPERIMENT_SLUG,
    }
