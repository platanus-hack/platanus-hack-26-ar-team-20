from __future__ import annotations

import json
import time
from datetime import datetime, timezone
from typing import Any

from anthropic import AsyncAnthropic
from pydantic import ValidationError

from agents.base import BaseAgent
from agents.indexer import extract_json
from agents.schemas import (
    WitnessGuardrailReading,
    WitnessInput,
    WitnessOutput,
    WitnessVariantVerdict,
)
from core.config import settings
from core.posthog_client import PostHogClient
from core.supabase_client import filter_experiment


# Demo-mode synthetic counts. Only used when HELIX_DEMO_MODE is true AND
# PostHog returns zero events for the arm — i.e. the demo is running
# without a fully seeded analytics project. Numbers are tuned so that the
# first treatment clears the p_best>0.90 + p_better>0.95 thresholds and
# guardrails stay below the 3% harm floor. Keyed by role+rank so it works
# whether or not Lab regenerates the variant keys.
_DEMO_CONTROL_PRIMARY = (2000, 820)               # rate 0.41
_DEMO_TREATMENT_PRIMARY: list[tuple[int, int]] = [
    (2000, 1000),  # +9pp → the winner
    (2000, 900),   # +4pp
    (2000, 940),   # +6pp
    (2000, 880),   # +3pp
    (2000, 860),   # +2pp
]
_DEMO_GUARDRAIL = {
    "aov":                         (2000, 1000),  # neutral
    "refund_rate_30d":             (2000, 40),    # ~2% (HARM_KPI but below 3% breach)
    "support_tickets_per_user_7d": (2000, 30),    # ~1.5%
    "abandonment_rate":            (2000, 30),    # ~1.5%
    "refund_rate":                 (2000, 40),    # ~2%
    "churn_30d":                   (2000, 60),    # ~3% (right at the line)
    "support_load":                (2000, 30),
}


def _demo_primary_stats(
    is_control: bool, treatment_index: int
) -> tuple[int, int]:
    if is_control:
        return _DEMO_CONTROL_PRIMARY
    safe_idx = max(
        0, min(treatment_index, len(_DEMO_TREATMENT_PRIMARY) - 1)
    )
    return _DEMO_TREATMENT_PRIMARY[safe_idx]


def _demo_guardrail_stats(kpi: str) -> tuple[int, int]:
    return _DEMO_GUARDRAIL.get(kpi, (2000, 60))


HARM_KPIS = {
    "refund_rate_30d",
    "refund_rate",
    "support_tickets_per_user_7d",
    "support_load",
    "churn_30d",
    "abandonment_rate",
}


def _parse_iso(ts: str | None) -> datetime | None:
    if not ts:
        return None
    s = ts.replace("Z", "+00:00")
    try:
        dt = datetime.fromisoformat(s)
    except ValueError:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt


class WitnessAgent(BaseAgent):
    name = "witness"
    model = "claude-sonnet-4-6"

    def __init__(
        self,
        anthropic_client: AsyncAnthropic,
        supabase_client,
        posthog_client: PostHogClient,
    ):
        super().__init__(anthropic_client, supabase_client)
        self.posthog = posthog_client

    async def run(
        self,
        input_data: WitnessInput,
        *,
        org_id: str,
        experiment_id: str | None = None,
    ) -> WitnessOutput:
        start = time.monotonic()
        tokens_in = 0
        tokens_out = 0
        exp_row_id = experiment_id

        try:
            exp = self._fetch_experiment(input_data.experiment_id)
            exp_row_id = exp["id"]

            design = exp.get("design") or {}
            variants = exp.get("variants") or design.get("variants") or []
            flag_key = exp.get("flag_key") or exp["experiment_id"]
            primary_kpi = design.get("primary_kpi")
            guardrail_kpis: list[str] = design.get("guardrail_kpis") or []
            min_obs = int(design.get("min_observation_days") or 7)
            max_obs = int(design.get("max_observation_days") or 14)

            started_at = _parse_iso(exp.get("started_at"))
            now = datetime.now(timezone.utc)
            days_live = input_data.days_live
            if days_live is None:
                days_live = (now - started_at).days if started_at else 0

            if days_live < min_obs:
                output = WitnessOutput(
                    experiment_id=exp["experiment_id"],
                    flag_key=flag_key,
                    primary_kpi=primary_kpi or "",
                    days_live=days_live,
                    min_observation_days=min_obs,
                    n_total=0,
                    experiment_verdict="too_early",
                    winning_variant=None,
                    variant_verdicts=[],
                    recommended_actions=[],
                    narrative=(
                        f"Aún es muy pronto: {days_live} días en vuelo, "
                        f"se necesitan al menos {min_obs}."
                    ),
                    confidence=0.99,
                )
                self._persist_results(experiment_id=exp_row_id, output=output)
                await self._audit(
                    org_id=org_id,
                    experiment_id=exp_row_id,
                    input_data=input_data,
                    output_data=output,
                    tokens_in=0,
                    tokens_out=0,
                    duration_ms=int((time.monotonic() - start) * 1000),
                )
                return output

            since_iso = (started_at or now).isoformat()
            arms = self._collect_arms(
                flag_key=flag_key,
                variants=variants,
                primary_kpi=primary_kpi or "",
                guardrail_kpis=guardrail_kpis,
                since=since_iso,
            )
            stats = self.posthog.thompson_multi_arm(arms=arms)
            n_total = sum(int(a["n"]) for a in arms)

            demo_mode = bool(getattr(settings, "helix_demo_mode", False))

            if demo_mode:
                # Demo path: skip Claude and use the deterministic fallback.
                # _collect_arms already injected canned counts when PostHog
                # had nothing to read, so stats are favorable for the first
                # treatment. Going through Claude here is both slower and
                # less reliable — Sonnet sometimes refuses to declare a
                # winner from synthetic-looking numbers, which kills the
                # demo flow (verdict stays "no_signal", Director picks
                # "wait", Consolidate never appears).
                output = self._fallback_output(
                    exp=exp,
                    flag_key=flag_key,
                    primary_kpi=primary_kpi or "",
                    days_live=days_live,
                    min_obs=min_obs,
                    arms=arms,
                    stats=stats,
                    n_total=n_total,
                )
            else:
                user_message = json.dumps(
                    {
                        "experiment": {
                            "experiment_id": exp["experiment_id"],
                            "flag_key": flag_key,
                            "primary_kpi": primary_kpi,
                            "guardrail_kpis": guardrail_kpis,
                            "days_live": days_live,
                            "min_observation_days": min_obs,
                            "max_observation_days": max_obs,
                            "design": design,
                            "started_at": exp.get("started_at"),
                        },
                        "arms": arms,
                        "stats": stats,
                        "n_total": n_total,
                        "decision_rule": design.get("decision_rule"),
                    }
                )

                resp = await self.client.messages.create(
                    model=self.model,
                    max_tokens=4000,
                    system=self._load_prompt(),
                    messages=[{"role": "user", "content": user_message}],
                )
                tokens_in = resp.usage.input_tokens
                tokens_out = resp.usage.output_tokens

                text = next(
                    (b.text for b in resp.content if getattr(b, "type", None) == "text"),
                    "",
                )

                try:
                    output = WitnessOutput.model_validate_json(extract_json(text))
                except (ValueError, ValidationError):
                    output = self._fallback_output(
                        exp=exp,
                        flag_key=flag_key,
                        primary_kpi=primary_kpi or "",
                        days_live=days_live,
                        min_obs=min_obs,
                        arms=arms,
                        stats=stats,
                        n_total=n_total,
                    )

            output.experiment_id = exp["experiment_id"]
            output.flag_key = flag_key
            output.primary_kpi = primary_kpi or output.primary_kpi
            output.days_live = days_live
            output.min_observation_days = min_obs
            output.n_total = n_total
            if output.experiment_verdict != "ship_winner":
                output.winning_variant = None

            self._persist_results(experiment_id=exp_row_id, output=output)

            await self._audit(
                org_id=org_id,
                experiment_id=exp_row_id,
                input_data=input_data,
                output_data=output,
                tokens_in=tokens_in,
                tokens_out=tokens_out,
                duration_ms=int((time.monotonic() - start) * 1000),
            )
            return output
        except Exception as e:
            await self._audit(
                org_id=org_id,
                experiment_id=exp_row_id,
                input_data=input_data,
                output_data=None,
                tokens_in=tokens_in,
                tokens_out=tokens_out,
                duration_ms=int((time.monotonic() - start) * 1000),
                status="error",
                error=str(e),
            )
            raise

    # ------------------------------------------------------------------
    # DB
    # ------------------------------------------------------------------
    def _fetch_experiment(self, experiment_id: str) -> dict:
        rows = (
            filter_experiment(self.db.table("experiments").select("id, org_id, experiment_id, design, variants, flag_key, "
                "started_at, status"), experiment_id)
            .limit(1)
            .execute()
            .data
        )
        if not rows:
            raise ValueError(f"experiment {experiment_id} not found")
        return rows[0]

    def _persist_results(self, *, experiment_id: str | None, output: WitnessOutput) -> None:
        if not experiment_id:
            return
        update: dict[str, Any] = {
            "results": output.model_dump(),
            "status": "analyzing",
        }
        if output.experiment_verdict == "ship_winner" and output.winning_variant:
            update["winning_variant"] = output.winning_variant
        self.db.table("experiments").update(update).eq("id", experiment_id).execute()

    # ------------------------------------------------------------------
    # PostHog data collection
    # ------------------------------------------------------------------
    def _collect_arms(
        self,
        *,
        flag_key: str,
        variants: list[dict],
        primary_kpi: str,
        guardrail_kpis: list[str],
        since: str,
    ) -> list[dict]:
        demo_mode = bool(getattr(settings, "helix_demo_mode", False))
        arms: list[dict] = []
        treatment_idx = 0
        for v in variants:
            variant_key = v["variant_key"]
            is_control = bool(v.get("is_control"))
            try:
                n, conv = self.posthog.query_variant_metrics(
                    flag_key=flag_key,
                    variant_key=variant_key,
                    kpi=primary_kpi,
                    since=since,
                )
            except Exception:
                n, conv = 0, 0

            # Demo fallback: if PostHog has nothing seeded for this flag,
            # use deterministic synthetic counts so the demo can produce a
            # winner end-to-end. Real data always wins (only kicks in on n=0).
            if demo_mode and n == 0:
                n, conv = _demo_primary_stats(is_control, treatment_idx)

            guardrails: list[dict] = []
            for g_kpi in guardrail_kpis:
                try:
                    g_n, g_conv = self.posthog.query_variant_metrics(
                        flag_key=flag_key,
                        variant_key=variant_key,
                        kpi=g_kpi,
                        since=since,
                    )
                except Exception:
                    g_n, g_conv = 0, 0
                if demo_mode and g_n == 0:
                    g_n, g_conv = _demo_guardrail_stats(g_kpi)
                guardrails.append({"kpi": g_kpi, "n": g_n, "conv": g_conv})

            arms.append(
                {
                    "key": variant_key,
                    "is_control": is_control,
                    "n": int(n),
                    "conv": int(conv),
                    "guardrails": guardrails,
                }
            )
            if not is_control:
                treatment_idx += 1
        return arms

    # ------------------------------------------------------------------
    # Fallback (deterministic) verdict, used if Claude returns garbage
    # ------------------------------------------------------------------
    def _fallback_output(
        self,
        *,
        exp: dict,
        flag_key: str,
        primary_kpi: str,
        days_live: int,
        min_obs: int,
        arms: list[dict],
        stats: dict[str, dict[str, float]],
        n_total: int,
    ) -> WitnessOutput:
        control = next((a for a in arms if a.get("is_control")), arms[0] if arms else None)
        control_guardrails = {
            g["kpi"]: (g["conv"] / g["n"]) if g["n"] else 0.0
            for g in (control.get("guardrails") or [])
        } if control else {}

        verdicts: list[WitnessVariantVerdict] = []
        winners: list[str] = []
        losers: list[str] = []
        for a in arms:
            s = stats.get(a["key"], {})
            rate = (a["conv"] / a["n"]) if a["n"] else 0.0
            guardrails: list[WitnessGuardrailReading] = []
            breach = False
            for g in a.get("guardrails") or []:
                g_rate = (g["conv"] / g["n"]) if g["n"] else 0.0
                ctrl = control_guardrails.get(g["kpi"], 0.0)
                rel = ((g_rate - ctrl) / ctrl) if ctrl > 1e-6 else 0.0
                g_breach = g["kpi"] in HARM_KPIS and rel > 0.03
                if g_breach:
                    breach = True
                guardrails.append(
                    WitnessGuardrailReading(
                        kpi=g["kpi"],
                        rate=g_rate,
                        rate_vs_control_rel=rel,
                        breach=g_breach,
                    )
                )

            p_better = float(s.get("p_better_than_control", 0.0))
            p_best = float(s.get("p_is_best", 0.0))

            if a.get("is_control"):
                verdict = "inconclusive"
                rationale = "Control baseline."
            elif breach:
                verdict = "loser"
                rationale = "Guardrail breach detectado."
                losers.append(a["key"])
            elif p_best > 0.90 and p_better > 0.95:
                verdict = "winner"
                rationale = f"p(best)={p_best:.2f}, p(>control)={p_better:.2f}."
                winners.append(a["key"])
            elif p_better < 0.20:
                verdict = "loser"
                rationale = f"p(>control)={p_better:.2f} muy bajo."
                losers.append(a["key"])
            else:
                verdict = "inconclusive"
                rationale = f"Sin señal clara: p(best)={p_best:.2f}."

            verdicts.append(
                WitnessVariantVerdict(
                    variant_key=a["key"],
                    is_control=bool(a.get("is_control")),
                    n=int(a["n"]),
                    conv=int(a["conv"]),
                    rate=rate,
                    p_better_than_control=p_better,
                    p_is_best=p_best,
                    guardrails=guardrails,
                    guardrail_breach=breach,
                    verdict=verdict,
                    rationale=rationale,
                )
            )

        treatments = [v for v in verdicts if not v.is_control]
        if not treatments:
            experiment_verdict = "no_signal"
            winning_variant = None
        elif len(winners) == 1:
            experiment_verdict = "ship_winner"
            winning_variant = winners[0]
        elif treatments and all(v.verdict == "loser" for v in treatments):
            experiment_verdict = "kill_all"
            winning_variant = None
        else:
            experiment_verdict = "inconclusive"
            winning_variant = None

        recommended: list[dict] = []
        if experiment_verdict == "ship_winner":
            recommended.append(
                {
                    "action": "ramp_winner_kill_others",
                    "flag_key": flag_key,
                    "payload": {"winner": winning_variant},
                    "rationale": "Winner claro con guardrails sanos.",
                }
            )
        elif experiment_verdict == "kill_all":
            recommended.append(
                {
                    "action": "kill_all",
                    "flag_key": flag_key,
                    "payload": {},
                    "rationale": "Ningún tratamiento mejora a control sin breach.",
                }
            )
        else:
            recommended.append(
                {
                    "action": "wait",
                    "flag_key": flag_key,
                    "payload": {},
                    "rationale": "Señal aún no concluyente.",
                }
            )

        return WitnessOutput.model_validate(
            {
                "experiment_id": exp["experiment_id"],
                "flag_key": flag_key,
                "primary_kpi": primary_kpi,
                "days_live": days_live,
                "min_observation_days": min_obs,
                "n_total": n_total,
                "experiment_verdict": experiment_verdict,
                "winning_variant": winning_variant,
                "variant_verdicts": [v.model_dump() for v in verdicts],
                "recommended_actions": recommended,
                "narrative": (
                    f"Veredicto determinístico (fallback): {experiment_verdict}."
                ),
                "confidence": 0.5,
            }
        )
