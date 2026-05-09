from __future__ import annotations

import json
import time

from pydantic import ValidationError

from agents.base import BaseAgent
from agents.indexer import extract_json
from agents.schemas import BriefInput, BriefOutput


DEFAULT_KPIS: list[str] = [
    "cart_to_checkout_rate",
    "aov",
    "abandonment_rate",
    "onboarding_completion_rate",
    "activation_rate_d1",
    "activation_rate_d7",
    "churn_30d",
    "retention_d7",
    "retention_d30",
    "support_tickets_per_user_7d",
    "refund_rate_30d",
    "trial_to_paid_rate",
    "feature_adoption_rate",
]


class BriefAgent(BaseAgent):
    name = "brief"
    model = "claude-sonnet-4-6"

    async def run(
        self,
        input_data: BriefInput,
        *,
        org_id: str,
        experiment_id: str | None = None,
    ) -> BriefOutput:
        start = time.monotonic()
        tokens_in = 0
        tokens_out = 0

        try:
            feature_state = (
                self.db.table("feature_state")
                .select("feature_name, status, source_files")
                .eq("repo_id", input_data.repo_id)
                .execute()
                .data
                or []
            )
            available_kpis = self._fetch_available_kpis(org_id)

            user_message = json.dumps(
                {
                    "human_brief": input_data.human_brief,
                    "context": {
                        "available_kpis": available_kpis,
                        "feature_state_summary": feature_state[:30],
                    },
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
                output = BriefOutput.model_validate_json(extract_json(text))
            except (ValueError, ValidationError) as e:
                duration_ms = int((time.monotonic() - start) * 1000)
                await self._audit(
                    org_id=org_id,
                    experiment_id=experiment_id,
                    input_data=input_data,
                    output_data={"raw": text[:4000]},
                    tokens_in=tokens_in,
                    tokens_out=tokens_out,
                    duration_ms=duration_ms,
                    status="error",
                    error=f"invalid_json: {e}",
                )
                raise ValueError(f"brief returned invalid output: {e}") from e

            await self._audit(
                org_id=org_id,
                experiment_id=experiment_id,
                input_data=input_data,
                output_data=output,
                tokens_in=tokens_in,
                tokens_out=tokens_out,
                duration_ms=int((time.monotonic() - start) * 1000),
            )
            return output
        except ValueError:
            raise
        except Exception as e:
            duration_ms = int((time.monotonic() - start) * 1000)
            await self._audit(
                org_id=org_id,
                experiment_id=experiment_id,
                input_data=input_data,
                output_data=None,
                tokens_in=tokens_in,
                tokens_out=tokens_out,
                duration_ms=duration_ms,
                status="error",
                error=str(e),
            )
            raise

    def _fetch_available_kpis(self, org_id: str) -> list[str]:
        # MVP: return the default SaaS KPI catalog.
        # Future: query the PostHog event catalog for this org and merge.
        return list(DEFAULT_KPIS)
