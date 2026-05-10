from __future__ import annotations

import json
import time
from datetime import datetime, timezone

from pydantic import ValidationError

from agents.base import BaseAgent
from agents.indexer import extract_json
from agents.schemas import LabInput, LabOutput, LabVariant
from core.config import settings


# Pre-baked demo design used when HELIX_DEMO_MODE is true. Same shape as
# the seed experiment so the variant keys line up with the files
# pre-committed on helix/exp_cart_conv_2026 in the demo repo. This makes
# Lab return in <1s so "Run all" can complete in 30s.
_DEMO_VARIANTS: list[LabVariant] = [
    LabVariant(
        variant_key="control",
        is_control=True,
        hypothesis="Status quo",
        implementation_brief="No changes",
    ),
    LabVariant(
        variant_key="recently_seen",
        axis="recall",
        hypothesis=(
            "Mostrar 3 ultimos productos vistos arriba del cart sube +9pp "
            "la conversion"
        ),
        implementation_brief="Componente que lee historial y renderea 3 cards",
        expected_lift_pp=9,
    ),
    LabVariant(
        variant_key="similar_offer",
        axis="cross_sell",
        hypothesis=(
            "Ofertas de productos similares al del cart suben la AOV y la "
            "conversion"
        ),
        implementation_brief="Componente que llama recomendador y muestra ofertas",
        expected_lift_pp=4,
    ),
    LabVariant(
        variant_key="urgency_timer",
        axis="urgency",
        hypothesis="Banner de urgency sube la conversion a corto plazo",
        implementation_brief="Banner con countdown 15min",
        expected_lift_pp=6,
    ),
]


class LabAgent(BaseAgent):
    name = "lab"
    model = "claude-sonnet-4-6"

    async def run(
        self,
        input_data: LabInput,
        *,
        org_id: str,
        experiment_id: str | None = None,
    ) -> LabOutput:
        start = time.monotonic()
        tokens_in = 0
        tokens_out = 0

        try:
            # Demo path: skip Claude entirely and return the canned design.
            # The variant keys match files pre-committed in the demo repo,
            # which is what lets Architect compose actually open a PR.
            if getattr(settings, "helix_demo_mode", False):
                output = LabOutput(
                    primary_kpi=input_data.interpreted_problem.primary_kpi,
                    guardrail_kpis=list(
                        input_data.interpreted_problem.guardrail_kpis
                    ) or [
                        "aov",
                        "refund_rate_30d",
                        "support_tickets_per_user_7d",
                    ],
                    variants=list(_DEMO_VARIANTS),
                    traffic_split=[0.25, 0.25, 0.25, 0.25],
                    min_n_per_arm=1260,
                    min_observation_days=7,
                    max_observation_days=14,
                    decision_rule=(
                        "Bayesian Thompson sampling. Winner declared when "
                        "p(best > control) > 0.95 AND no guardrail breach."
                    ),
                    frozen=True,
                    registered_at=datetime.now(timezone.utc).isoformat(),
                )
                if experiment_id:
                    self._persist_design(experiment_id=experiment_id, output=output)
                await self._audit(
                    org_id=org_id,
                    experiment_id=experiment_id,
                    input_data=input_data,
                    output_data=output,
                    tokens_in=0,
                    tokens_out=0,
                    duration_ms=int((time.monotonic() - start) * 1000),
                )
                return output

            user_message = json.dumps(
                {
                    "interpreted_problem": input_data.interpreted_problem.model_dump(),
                    "context": input_data.context,
                    "constraints": input_data.constraints,
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
                output = LabOutput.model_validate_json(extract_json(text))
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
                raise ValueError(f"lab returned invalid output: {e}") from e

            # Force the runtime invariants Lab can't be trusted to honor.
            output.frozen = True
            if not output.registered_at:
                output.registered_at = datetime.now(timezone.utc).isoformat()
            output.primary_kpi = input_data.interpreted_problem.primary_kpi

            if experiment_id:
                self._persist_design(experiment_id=experiment_id, output=output)

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

    def _persist_design(self, *, experiment_id: str, output: LabOutput) -> None:
        design_json = output.model_dump()
        variants_json = [v.model_dump() for v in output.variants]
        self.db.table("experiments").update(
            {
                "design": design_json,
                "variants": variants_json,
                "status": "implementing",
            }
        ).eq("id", experiment_id).execute()
