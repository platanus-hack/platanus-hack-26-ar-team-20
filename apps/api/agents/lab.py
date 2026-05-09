from __future__ import annotations

import json
import time
from datetime import datetime, timezone

from pydantic import ValidationError

from agents.base import BaseAgent
from agents.indexer import extract_json
from agents.schemas import LabInput, LabOutput


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
