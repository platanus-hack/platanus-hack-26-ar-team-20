from __future__ import annotations

import json
import time
from datetime import datetime, timedelta, timezone
from typing import Any

from anthropic import AsyncAnthropic
from pydantic import ValidationError

from agents.base import BaseAgent
from agents.indexer import extract_json
from agents.schemas import (
    DirectorAction,
    DirectorDecision,
    DirectorFollowUp,
    DirectorInput,
    DirectorOutput,
    DirectorPolicy,
    WitnessOutput,
    WitnessRecommendedAction,
)
from core.posthog_client import PostHogClient


REVERSIBLE_WINDOW = timedelta(hours=24)
CONSOLIDATE_DELAY = timedelta(days=7)


class DirectorAgent(BaseAgent):
    name = "director"
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
        input_data: DirectorInput,
        *,
        org_id: str,
        experiment_id: str | None = None,
    ) -> DirectorOutput:
        start = time.monotonic()
        tokens_in = 0
        tokens_out = 0
        exp_row_id = experiment_id

        try:
            witness = input_data.witness_output
            exp = self._fetch_experiment(witness.experiment_id)
            exp_row_id = exp["id"]
            policy = input_data.user_policy or self._fetch_policy(org_id)

            decisions: list[DirectorDecision] = []
            follow_ups: list[DirectorFollowUp] = []

            for action in witness.recommended_actions:
                decision = self._plan_decision(
                    action=action,
                    witness=witness,
                    policy=policy,
                )
                decision = self._gate_and_execute(decision=decision, policy=policy)
                self._persist_decision(
                    org_id=org_id,
                    experiment_id=exp_row_id,
                    decision=decision,
                )
                decisions.append(decision)

                if decision.action == "ship_winner" and decision.executed:
                    follow_up = DirectorFollowUp(
                        type="schedule_consolidate",
                        payload={
                            "experiment_id": witness.experiment_id,
                            "not_before": (
                                datetime.now(timezone.utc) + CONSOLIDATE_DELAY
                            ).isoformat(),
                        },
                    )
                    follow_ups.append(follow_up)
                    self._persist_follow_up_decision(
                        org_id=org_id,
                        experiment_id=exp_row_id,
                        follow_up=follow_up,
                    )

            output = DirectorOutput(
                experiment_id=witness.experiment_id,
                decisions=decisions,
                follow_ups=follow_ups,
                summary_for_human="",
            )

            try:
                claude_output, t_in, t_out = await self._claude_summary(
                    witness=witness,
                    policy=policy,
                    decisions=decisions,
                    follow_ups=follow_ups,
                    exp=exp,
                )
                tokens_in = t_in
                tokens_out = t_out
                if claude_output:
                    output.summary_for_human = (
                        claude_output.get("summary_for_human") or ""
                    )
                    claude_decisions = claude_output.get("decisions") or []
                    for orig, c in zip(output.decisions, claude_decisions, strict=False):
                        if isinstance(c, dict) and c.get("rationale"):
                            orig.rationale = c["rationale"]
                            self._update_decision_rationale(orig)
            except Exception:
                pass

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
            self.db.table("experiments")
            .select(
                "id, org_id, experiment_id, flag_key, design, variants, status"
            )
            .or_(f"id.eq.{experiment_id},experiment_id.eq.{experiment_id}")
            .limit(1)
            .execute()
            .data
        )
        if not rows:
            raise ValueError(f"experiment {experiment_id} not found")
        return rows[0]

    def _fetch_policy(self, org_id: str) -> DirectorPolicy:
        rows = (
            self.db.table("organizations")
            .select("policy")
            .eq("id", org_id)
            .limit(1)
            .execute()
            .data
        )
        raw = (rows[0].get("policy") if rows else None) or {}
        try:
            return DirectorPolicy.model_validate(raw)
        except ValidationError:
            return DirectorPolicy()

    # ------------------------------------------------------------------
    # Plan
    # ------------------------------------------------------------------
    def _plan_decision(
        self,
        *,
        action: WitnessRecommendedAction,
        witness: WitnessOutput,
        policy: DirectorPolicy,
    ) -> DirectorDecision:
        flag_key = action.flag_key
        before_state = self._snapshot_flag(flag_key)

        mapped: DirectorAction
        payload: dict[str, Any] = {}
        rationale = action.rationale or ""

        if action.action == "ramp_winner_kill_others":
            winner = action.payload.get("winner") or witness.winning_variant
            mapped = "ship_winner"
            payload = {"winner": winner}
        elif action.action == "kill_variant":
            mapped = "kill_variant"
            payload = {"variant_key": action.payload.get("variant_key")}
        elif action.action == "extend_top_two":
            mapped = "extend_top_two"
            payload = {"top_two": action.payload.get("top_two") or []}
        elif action.action == "kill_all":
            mapped = "kill_all"
            payload = {}
        else:
            mapped = "wait"
            payload = {}

        return DirectorDecision(
            action=mapped,
            flag_key=flag_key,
            payload=payload,
            before_state=before_state,
            rationale=rationale,
        )

    # ------------------------------------------------------------------
    # Policy gate + PostHog execution
    # ------------------------------------------------------------------
    def _gate_and_execute(
        self,
        *,
        decision: DirectorDecision,
        policy: DirectorPolicy,
    ) -> DirectorDecision:
        flag_key = decision.flag_key or ""

        if decision.action == "wait":
            decision.executed = False
            return decision

        if flag_key in (policy.kill_protected_flags or []):
            decision.executed = False
            decision.human_required = True
            decision.blocked_by = "kill_switch_protection"
            return decision

        blast = self._estimated_blast_radius(decision)
        if blast > policy.max_blast_radius_pct:
            decision.executed = False
            decision.human_required = True
            decision.blocked_by = "max_blast_radius_pct"
            return decision

        try:
            after = self._execute_action(decision)
        except Exception as e:
            decision.executed = False
            decision.human_required = True
            decision.blocked_by = f"posthog_error:{e.__class__.__name__}"
            return decision

        decision.after_state = after
        decision.executed = True
        decision.reversible_until = (
            datetime.now(timezone.utc) + REVERSIBLE_WINDOW
        ).isoformat()
        return decision

    def _execute_action(self, decision: DirectorDecision) -> dict[str, Any]:
        flag_key = decision.flag_key or ""
        if decision.action == "ship_winner":
            winner = decision.payload.get("winner")
            if not winner:
                raise ValueError("ship_winner missing 'winner'")
            splits = self._splits_for_ship_winner(flag_key=flag_key, winner=winner)
            self.posthog.set_variant_split(flag_key, splits)
        elif decision.action == "kill_variant":
            variant_key = decision.payload.get("variant_key")
            if not variant_key:
                raise ValueError("kill_variant missing 'variant_key'")
            self.posthog.kill_variant(flag_key, variant_key)
        elif decision.action == "extend_top_two":
            top_two = decision.payload.get("top_two") or []
            if len(top_two) != 2:
                raise ValueError("extend_top_two requires exactly 2 keys")
            splits = self._splits_for_extend_top_two(
                flag_key=flag_key, top_two=top_two
            )
            self.posthog.set_variant_split(flag_key, splits)
        elif decision.action == "kill_all":
            self.posthog.delete_flag(flag_key)
        return self._snapshot_flag(flag_key)

    def _snapshot_flag(self, flag_key: str | None) -> dict[str, Any] | None:
        if not flag_key:
            return None
        try:
            flag = self.posthog.get_flag(flag_key)
        except Exception:
            return None
        if flag is None:
            return None
        filters = flag.get("filters") or {}
        multivariate = filters.get("multivariate") or {}
        groups = filters.get("groups") or []
        return {
            "key": flag.get("key"),
            "active": flag.get("active"),
            "rollout_pct": (groups[0].get("rollout_percentage") if groups else None),
            "variants": [
                {"key": v.get("key"), "rollout_percentage": v.get("rollout_percentage")}
                for v in multivariate.get("variants") or []
            ],
        }

    def _splits_for_ship_winner(
        self, *, flag_key: str, winner: str
    ) -> dict[str, int]:
        flag = self.posthog.get_flag(flag_key) or {}
        filters = flag.get("filters") or {}
        variants = (filters.get("multivariate") or {}).get("variants") or []
        splits: dict[str, int] = {}
        for v in variants:
            key = v.get("key")
            if not key:
                continue
            splits[key] = 100 if key == winner else 0
        if winner not in splits:
            splits[winner] = 100
        return splits

    def _splits_for_extend_top_two(
        self, *, flag_key: str, top_two: list[str]
    ) -> dict[str, int]:
        flag = self.posthog.get_flag(flag_key) or {}
        filters = flag.get("filters") or {}
        variants = (filters.get("multivariate") or {}).get("variants") or []
        splits: dict[str, int] = {}
        for v in variants:
            key = v.get("key")
            if not key:
                continue
            splits[key] = 50 if key in top_two else 0
        for k in top_two:
            splits.setdefault(k, 50)
        return splits

    def _estimated_blast_radius(self, decision: DirectorDecision) -> int:
        # `max_blast_radius_pct` is interpreted as the upper bound on the
        # share of users a single decision may affect. Ship/kill actions on
        # already-running experiments stay within the flag's existing
        # rollout, so we use that as a proxy.
        snap = decision.before_state or {}
        rollout = snap.get("rollout_pct") if isinstance(snap, dict) else None
        if rollout is None:
            return 0
        try:
            return int(rollout)
        except (TypeError, ValueError):
            return 0

    # ------------------------------------------------------------------
    # Persistence
    # ------------------------------------------------------------------
    def _persist_decision(
        self,
        *,
        org_id: str,
        experiment_id: str | None,
        decision: DirectorDecision,
    ) -> None:
        row = {
            "org_id": org_id,
            "experiment_id": experiment_id,
            "action": decision.action,
            "before_state": decision.before_state,
            "after_state": decision.after_state,
            "rationale": decision.rationale,
            "executed": decision.executed,
            "human_required": decision.human_required,
            "reversible_until": decision.reversible_until,
        }
        resp = self.db.table("decisions").insert(row).execute()
        new_id = (resp.data or [{}])[0].get("id") if resp.data else None
        if new_id:
            decision.decision_id = new_id

    def _persist_follow_up_decision(
        self,
        *,
        org_id: str,
        experiment_id: str | None,
        follow_up: DirectorFollowUp,
    ) -> None:
        row = {
            "org_id": org_id,
            "experiment_id": experiment_id,
            "action": follow_up.type,
            "before_state": None,
            "after_state": follow_up.payload,
            "rationale": "Programado por Director tras ship_winner.",
            "executed": False,
            "human_required": False,
            "reversible_until": None,
        }
        self.db.table("decisions").insert(row).execute()

    def _update_decision_rationale(self, decision: DirectorDecision) -> None:
        if not decision.decision_id:
            return
        self.db.table("decisions").update(
            {"rationale": decision.rationale}
        ).eq("id", decision.decision_id).execute()

    # ------------------------------------------------------------------
    # Claude
    # ------------------------------------------------------------------
    async def _claude_summary(
        self,
        *,
        witness: WitnessOutput,
        policy: DirectorPolicy,
        decisions: list[DirectorDecision],
        follow_ups: list[DirectorFollowUp],
        exp: dict,
    ) -> tuple[dict | None, int, int]:
        user_message = json.dumps(
            {
                "experiment": {
                    "experiment_id": exp.get("experiment_id"),
                    "flag_key": exp.get("flag_key"),
                    "primary_kpi": witness.primary_kpi,
                    "winning_variant": witness.winning_variant,
                },
                "witness_output": witness.model_dump(),
                "policy": policy.model_dump(),
                "decisions": [d.model_dump() for d in decisions],
                "follow_ups": [f.model_dump() for f in follow_ups],
            }
        )
        resp = await self.client.messages.create(
            model=self.model,
            max_tokens=1500,
            system=self._load_prompt(),
            messages=[{"role": "user", "content": user_message}],
        )
        text = next(
            (b.text for b in resp.content if getattr(b, "type", None) == "text"),
            "",
        )
        try:
            parsed = json.loads(extract_json(text))
        except (ValueError, json.JSONDecodeError):
            parsed = None
        return parsed, resp.usage.input_tokens, resp.usage.output_tokens
