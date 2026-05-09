from __future__ import annotations

import time
from datetime import datetime, timezone
from string import Template

from anthropic import AsyncAnthropic
from github import GithubException

from agents.base import BaseAgent
from agents.schemas import (
    ArchitectComposeInput,
    ArchitectComposeOutput,
    ArchitectMode,
    LabVariant,
)
from core.config import settings
from core.github_client import GitHubClient
from core.posthog_client import PostHogClient


COMPOSE_FLAG_ROLLOUT_PCT = 30
DEFAULT_BASE_BRANCH = "main"


class ArchitectAgent(BaseAgent):
    name = "architect"
    model = "claude-sonnet-4-6"

    def __init__(
        self,
        anthropic_client: AsyncAnthropic,
        supabase_client,
        github_client: GitHubClient,
        posthog_client: PostHogClient,
    ):
        super().__init__(anthropic_client, supabase_client)
        self.github = github_client
        self.posthog = posthog_client

    async def run(
        self,
        input_data,
        *,
        org_id: str,
        experiment_id: str | None = None,
        mode: ArchitectMode = "compose",
    ):
        if mode == "compose":
            if experiment_id is None:
                raise ValueError("experiment_id is required for architect compose mode")
            return await self.run_compose(
                input_data, org_id=org_id, experiment_id=experiment_id
            )
        if mode == "consolidate":
            raise NotImplementedError("architect consolidate mode is delivered in C9")
        raise ValueError(f"unknown architect mode: {mode}")

    # ------------------------------------------------------------------
    # Compose
    # ------------------------------------------------------------------
    async def run_compose(
        self,
        input_data: ArchitectComposeInput,
        *,
        org_id: str,
        experiment_id: str,
    ) -> ArchitectComposeOutput:
        start = time.monotonic()
        try:
            if not settings.helix_demo_mode:
                raise NotImplementedError(
                    "architect compose without HELIX_DEMO_MODE is not implemented yet; "
                    "the demo path opens a PR against pre-built variant files in the demo repo"
                )

            output = self._run_compose_demo(input_data)
            self._persist_compose(experiment_id=experiment_id, output=output)

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
        except Exception as e:
            await self._audit(
                org_id=org_id,
                experiment_id=experiment_id,
                input_data=input_data,
                output_data=None,
                tokens_in=0,
                tokens_out=0,
                duration_ms=int((time.monotonic() - start) * 1000),
                status="error",
                error=str(e),
            )
            raise

    def _run_compose_demo(
        self, input_data: ArchitectComposeInput
    ) -> ArchitectComposeOutput:
        repo = settings.github_demo_repo
        if not repo:
            raise ValueError("GITHUB_DEMO_REPO is not configured")

        variants = input_data.variants or input_data.design.variants
        if not variants:
            raise ValueError("compose input has no variants")

        branch = f"helix/{input_data.experiment_id}"
        base = DEFAULT_BASE_BRANCH
        control_key = next(
            (v.variant_key for v in variants if v.is_control), variants[0].variant_key
        )

        flag_key = self._ensure_multivariate_flag(
            flag_key=input_data.experiment_id,
            variants=variants,
            rollout_pct=COMPOSE_FLAG_ROLLOUT_PCT,
            default_key=control_key,
        )

        files_present = self._ensure_branch(
            repo=repo,
            branch=branch,
            base=base,
            variants=variants,
            experiment_id=input_data.experiment_id,
        )

        pr_url = self._ensure_pr(
            repo=repo,
            branch=branch,
            base=base,
            title=f"Helix experiment — {input_data.experiment_id}",
            body=self._render_compose_pr_body(input_data, files=files_present),
        )

        return ArchitectComposeOutput(
            pr_url=pr_url,
            branch=branch,
            multivariate_flag_key=flag_key,
            variants_implemented=[v.variant_key for v in variants],
            files_changed=files_present,
            flag_rollout_pct=COMPOSE_FLAG_ROLLOUT_PCT,
            demo_mode=True,
        )

    # ------------------------------------------------------------------
    # PostHog
    # ------------------------------------------------------------------
    def _ensure_multivariate_flag(
        self,
        *,
        flag_key: str,
        variants: list[LabVariant],
        rollout_pct: int,
        default_key: str,
    ) -> str:
        existing = self.posthog.get_flag(flag_key)
        if existing is not None:
            return existing.get("key", flag_key)

        n = len(variants)
        base_pct = 100 // n
        leftover = 100 - base_pct * n
        variants_payload = []
        for i, v in enumerate(variants):
            pct = base_pct + (1 if i < leftover else 0)
            variants_payload.append(
                {
                    "key": v.variant_key,
                    "name": v.variant_key,
                    "rollout_percentage": pct,
                }
            )
        self.posthog.create_multivariate_flag(
            key=flag_key,
            variants=variants_payload,
            rollout_pct=rollout_pct,
            default=default_key,
        )
        return flag_key

    # ------------------------------------------------------------------
    # GitHub
    # ------------------------------------------------------------------
    def _ensure_branch(
        self,
        *,
        repo: str,
        branch: str,
        base: str,
        variants: list[LabVariant],
        experiment_id: str,
    ) -> list[str]:
        repo_obj = self.github._gh.get_repo(repo)
        try:
            repo_obj.get_branch(branch)
            return self._list_variant_files(
                repo_obj=repo_obj,
                branch=branch,
                variants=variants,
                experiment_id=experiment_id,
            )
        except GithubException:
            base_ref = repo_obj.get_git_ref(f"heads/{base}")
            repo_obj.create_git_ref(f"refs/heads/{branch}", base_ref.object.sha)
            return []

    def _list_variant_files(
        self,
        *,
        repo_obj,
        branch: str,
        variants: list[LabVariant],
        experiment_id: str,
    ) -> list[str]:
        present: list[str] = []
        for v in variants:
            path = f"lib/experiments/{experiment_id}/{v.variant_key}.tsx"
            try:
                repo_obj.get_contents(path, ref=branch)
            except GithubException:
                continue
            present.append(path)
        return present

    def _ensure_pr(
        self,
        *,
        repo: str,
        branch: str,
        base: str,
        title: str,
        body: str,
    ) -> str:
        repo_obj = self.github._gh.get_repo(repo)
        owner_login = repo_obj.owner.login
        try:
            existing = list(
                repo_obj.get_pulls(
                    state="open", head=f"{owner_login}:{branch}", base=base
                )
            )
        except GithubException:
            existing = []
        if existing:
            existing_pr = existing[0]
            try:
                existing_pr.edit(body=body)
            except GithubException:
                pass
            return existing_pr.html_url
        return self.github.create_pr(
            repo=repo, head=branch, base=base, title=title, body=body
        )

    # ------------------------------------------------------------------
    # PR body
    # ------------------------------------------------------------------
    def _render_compose_pr_body(
        self,
        input_data: ArchitectComposeInput,
        *,
        files: list[str],
    ) -> str:
        template = Template(self._load_prompt())
        design = input_data.design
        variants = input_data.variants or design.variants

        variants_md = "\n".join(self._render_variant(v, files) for v in variants)
        files_md = (
            "\n".join(f"- `{p}`" for p in files)
            if files
            else "_(branch is empty — variant files will be committed by the next compose run or by hand for the demo)_"
        )
        traffic_md = ", ".join(
            f"`{v.variant_key}` = {pct:.0%}"
            for v, pct in zip(variants, design.traffic_split, strict=False)
        )

        return template.safe_substitute(
            experiment_id=input_data.experiment_id,
            primary_kpi=design.primary_kpi,
            guardrail_kpis=", ".join(f"`{k}`" for k in design.guardrail_kpis) or "—",
            traffic_split=traffic_md,
            min_n_per_arm=design.min_n_per_arm,
            min_observation_days=design.min_observation_days,
            max_observation_days=design.max_observation_days,
            decision_rule=design.decision_rule,
            registered_at=design.registered_at
            or datetime.now(timezone.utc).isoformat(),
            variants_md=variants_md,
            files_md=files_md,
            flag_key=input_data.experiment_id,
            flag_rollout_pct=COMPOSE_FLAG_ROLLOUT_PCT,
        )

    @staticmethod
    def _render_variant(v: LabVariant, files: list[str]) -> str:
        role = "control" if v.is_control else "treatment"
        axis = v.axis or "—"
        lift = (
            f"{v.expected_lift_pp:+.1f}pp"
            if v.expected_lift_pp is not None
            else "n/a"
        )
        file_match = next(
            (f for f in files if f.endswith(f"/{v.variant_key}.tsx")),
            "_(file pre-created in branch)_",
        )
        return (
            f"- **`{v.variant_key}`** ({role}, axis={axis}, expected lift={lift})\n"
            f"  - Hypothesis: {v.hypothesis}\n"
            f"  - Implementation: {v.implementation_brief}\n"
            f"  - File: `{file_match}`"
        )

    # ------------------------------------------------------------------
    # Persistence
    # ------------------------------------------------------------------
    def _persist_compose(
        self, *, experiment_id: str, output: ArchitectComposeOutput
    ) -> None:
        self.db.table("experiments").update(
            {
                "pr_url": output.pr_url,
                "flag_key": output.multivariate_flag_key,
                "status": "running",
                "started_at": datetime.now(timezone.utc).isoformat(),
            }
        ).eq("id", experiment_id).execute()
