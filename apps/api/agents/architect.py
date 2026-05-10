from __future__ import annotations

import re
import time
from datetime import date, datetime, timezone
from string import Template

from anthropic import AsyncAnthropic
from github import GithubException

from agents.base import BaseAgent
from agents.schemas import (
    ArchitectComposeInput,
    ArchitectComposeOutput,
    ArchitectConsolidateInput,
    ArchitectConsolidateOutput,
    ArchitectMode,
    LabVariant,
)
from core.config import settings
from core.github_client import GitHubClient
from core.posthog_client import PostHogClient
from core.supabase_client import filter_experiment


COMPOSE_FLAG_ROLLOUT_PCT = 30
DEFAULT_BASE_BRANCH = "main"
CONSOLIDATE_SWITCH_SITE = "apps/web/components/booking/CartSummary.tsx"


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
            if experiment_id is None:
                raise ValueError(
                    "experiment_id is required for architect consolidate mode"
                )
            return await self.run_consolidate(
                input_data, org_id=org_id, experiment_id=experiment_id
            )
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
        head = f"{owner_login}:{branch}"

        # Open PR for this branch — edit body, return.
        try:
            open_prs = list(
                repo_obj.get_pulls(state="open", head=head, base=base)
            )
        except GithubException:
            open_prs = []
        if open_prs:
            pr = open_prs[0]
            try:
                pr.edit(body=body)
            except GithubException:
                pass
            self._merge_pr_safely(pr, title=title)
            return pr.html_url

        # No open PR but a previous run might have merged one — return it
        # so the demo flow stays idempotent across replays.
        try:
            closed_prs = list(
                repo_obj.get_pulls(state="closed", head=head, base=base)
            )
        except GithubException:
            closed_prs = []
        merged = next((p for p in closed_prs if p.merged), None)
        if merged is not None:
            return merged.html_url

        # No PR at all — create one and merge it.
        pr_url = self.github.create_pr(
            repo=repo, head=branch, base=base, title=title, body=body
        )
        try:
            pr_number = int(pr_url.rsplit("/", 1)[-1])
            pr = repo_obj.get_pull(pr_number)
            self._merge_pr_safely(pr, title=title)
        except (GithubException, ValueError):
            # Creation succeeded; the merge is best-effort.
            pass
        return pr_url

    @staticmethod
    def _merge_pr_safely(pr, *, title: str) -> None:
        """Squash-merge the multivariate PR. Silently skip if the PR is
        already merged, has conflicts, or branch protection blocks it —
        the demo just shows the PR link in either case."""
        if pr.merged:
            return
        try:
            pr.merge(
                merge_method="squash",
                commit_title=f"{title} (auto-merged by Helix Architect)",
            )
        except GithubException:
            pass

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

    # ------------------------------------------------------------------
    # Consolidate
    # ------------------------------------------------------------------
    async def run_consolidate(
        self,
        input_data: ArchitectConsolidateInput,
        *,
        org_id: str,
        experiment_id: str,
    ) -> ArchitectConsolidateOutput:
        start = time.monotonic()
        try:
            repo = settings.github_demo_repo
            if not repo:
                raise ValueError("GITHUB_DEMO_REPO is not configured")

            exp = self._fetch_experiment(experiment_id)
            slug = exp.get("experiment_id") or input_data.experiment_id

            winner = input_data.winning_variant
            losers = list(input_data.losing_variants or [])
            base_path = f"lib/experiments/{slug}"
            tests_base = f"__tests__/{slug}"

            files_to_delete: list[str] = []
            for loser in losers:
                files_to_delete.append(f"{base_path}/{loser}.tsx")
                files_to_delete.append(f"{tests_base}/{loser}.test.tsx")

            files_to_move: list[tuple[str, str]] = [
                (f"{base_path}/{winner}.tsx", f"lib/cart/{winner}.tsx"),
                (
                    f"{tests_base}/{winner}.test.tsx",
                    f"__tests__/cart/{winner}.test.tsx",
                ),
            ]

            switch_site = CONSOLIDATE_SWITCH_SITE
            new_switch = self._compute_inlined_switch(
                repo=repo,
                switch_site=switch_site,
                winner=winner,
                experiment_id=slug,
            )

            files_changes: dict[str, str] = {}
            for src, dst in files_to_move:
                try:
                    files_changes[dst] = self.github.read_file(repo, src)
                except GithubException:
                    # Source not present (already moved or never created in
                    # the demo repo) — skip silently so consolidation stays
                    # idempotent.
                    continue
            if new_switch is not None:
                files_changes[switch_site] = new_switch

            actual_moves: list[tuple[str, str]] = [
                (src, dst)
                for src, dst in files_to_move
                if files_changes.get(dst) is not None
            ]

            candidate_deletes = list(files_to_delete)
            for src, _dst in actual_moves:
                candidate_deletes.append(src)
            deletes = [
                p
                for p in candidate_deletes
                if self.github.path_exists(repo, p, ref=DEFAULT_BASE_BRANCH)
            ]

            branch = (
                f"helix/consolidate-{slug}-{date.today().isoformat()}"
            )
            pr_url = self.github.commit_files_and_open_pr(
                repo=repo,
                branch=branch,
                base=DEFAULT_BASE_BRANCH,
                files=files_changes,
                deletes=deletes,
                title=f"🧹 Consolidate winner of {slug}: ship {winner}",
                body=self._render_consolidate_pr_body(
                    input_data=input_data,
                    files_deleted=deletes,
                    files_moved=actual_moves,
                    switch_site=switch_site,
                ),
            )

            flag_deleted = self._delete_flag_safely(input_data.flag_key)
            self._persist_consolidate(
                experiment_id=experiment_id,
                flag_key=input_data.flag_key,
            )

            output = ArchitectConsolidateOutput(
                pr_url=pr_url,
                branch=branch,
                flag_key=input_data.flag_key,
                winning_variant=winner,
                losing_variants=losers,
                files_deleted=deletes,
                files_moved=[
                    {"from": src, "to": dst} for src, dst in actual_moves
                ],
                switch_site=switch_site,
                flag_deleted=flag_deleted,
                demo_mode=settings.helix_demo_mode,
            )

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

    def _fetch_experiment(self, experiment_id: str) -> dict:
        rows = (
            filter_experiment(self.db.table("experiments").select("id, org_id, experiment_id, flag_key, design, variants, status"), experiment_id)
            .limit(1)
            .execute()
            .data
        )
        if not rows:
            raise ValueError(f"experiment {experiment_id} not found")
        return rows[0]

    def _compute_inlined_switch(
        self,
        *,
        repo: str,
        switch_site: str,
        winner: str,
        experiment_id: str,
    ) -> str | None:
        try:
            original = self.github.read_file(repo, switch_site)
        except GithubException:
            return None
        return self._refactor_switch_to_inline(
            original=original,
            winner=winner,
            winner_path=f"@/lib/cart/{winner}",
            experiment_id=experiment_id,
        )

    @staticmethod
    def _pascal_case(value: str) -> str:
        parts = [p for p in re.split(r"[-_\s]+", value) if p]
        return "".join(p[:1].upper() + p[1:] for p in parts) or "Winner"

    def _refactor_switch_to_inline(
        self,
        *,
        original: str,
        winner: str,
        winner_path: str,
        experiment_id: str,
    ) -> str:
        component = self._pascal_case(winner)
        new_import = f'import {component} from "{winner_path}";'
        banner = (
            f"// Auto-consolidated by Helix Architect — winner: "
            f"{winner} (experiment {experiment_id}).\n"
        )

        exp_prefix = f"@/lib/experiments/{experiment_id}/"
        saw_flag_hook = False
        has_winner_import = False
        kept_lines: list[str] = []
        for line in original.splitlines():
            stripped = line.lstrip()
            if stripped.startswith("import") and exp_prefix in line:
                continue
            if (
                stripped.startswith("import")
                and "useFeatureFlagVariantKey" in line
            ):
                saw_flag_hook = True
                continue
            if stripped.startswith("import") and winner_path in line:
                has_winner_import = True
            kept_lines.append(line)

        if not saw_flag_hook:
            return self._consolidate_template(
                component=component,
                winner=winner,
                winner_path=winner_path,
                experiment_id=experiment_id,
            )

        body = "\n".join(kept_lines)
        body = re.sub(
            r"^[ \t]*const\s+\w+\s*=\s*useFeatureFlagVariantKey\([^;]*\);"
            r"[ \t]*\r?\n",
            "",
            body,
            flags=re.MULTILINE,
        )
        body = re.sub(
            r"^[ \t]*if\s*\(\s*\w+\s*===\s*\"[^\"]+\"\s*\)\s*return\s+"
            r"<\w+(?:\s+\{\.\.\.[^}]*\})?\s*/>;[ \t]*\r?\n",
            "",
            body,
            flags=re.MULTILINE,
        )
        body = re.sub(
            r"return\s+<\w+(?P<spread>\s+\{\.\.\.[^}]*\})?\s*/>;",
            lambda m: (
                f"return <{component}"
                + (m.group("spread") or " {...props}")
                + " />;"
            ),
            body,
            count=1,
        )

        if not has_winner_import:
            imports = list(re.finditer(r"^import\s.*$", body, flags=re.MULTILINE))
            if imports:
                tail = imports[-1].end()
                body = body[:tail] + "\n" + new_import + body[tail:]
            else:
                body = new_import + "\n\n" + body

        if not body.endswith("\n"):
            body += "\n"
        return banner + body

    def _consolidate_template(
        self,
        *,
        component: str,
        winner: str,
        winner_path: str,
        experiment_id: str,
    ) -> str:
        return (
            f"// Auto-consolidated by Helix Architect — winner: "
            f"{winner} (experiment {experiment_id}).\n"
            f"// This file used to fork between variants behind a "
            f"PostHog flag; the winner now ships unconditionally.\n"
            f"\n"
            f'import {component} from "{winner_path}";\n'
            f"\n"
            f"export function CartSummary(props: any) {{\n"
            f"  return <{component} {{...props}} />;\n"
            f"}}\n"
            f"\n"
            f"export default CartSummary;\n"
        )

    def _render_consolidate_pr_body(
        self,
        *,
        input_data: ArchitectConsolidateInput,
        files_deleted: list[str],
        files_moved: list[tuple[str, str]],
        switch_site: str,
    ) -> str:
        deleted_md = (
            "\n".join(f"- `{p}`" for p in files_deleted) if files_deleted else "_(none)_"
        )
        moved_md = (
            "\n".join(f"- `{src}` → `{dst}`" for src, dst in files_moved)
            if files_moved
            else "_(none)_"
        )
        losers_md = (
            ", ".join(f"`{x}`" for x in input_data.losing_variants)
            or "_(none)_"
        )
        return (
            f"# 🧹 Consolidate {input_data.experiment_id} — ship "
            f"`{input_data.winning_variant}`\n"
            f"\n"
            f"This PR is opened by the **Helix Architect** agent in "
            f"`consolidate` mode. The experiment has been live for at least "
            f"7 days without guardrail alerts and the winning variant has "
            f"been ramped to 100%. We are now removing the multivariate "
            f"scaffolding so the codebase carries no orphan flag debt.\n"
            f"\n"
            f"## Outcome\n"
            f"\n"
            f"- **Winner:** `{input_data.winning_variant}`\n"
            f"- **Losers:** {losers_md}\n"
            f"- **Flag removed:** `{input_data.flag_key}` (deleted in PostHog)\n"
            f"\n"
            f"## Files moved out of `lib/experiments/`\n"
            f"\n"
            f"{moved_md}\n"
            f"\n"
            f"## Files deleted\n"
            f"\n"
            f"{deleted_md}\n"
            f"\n"
            f"## Switch site inlined\n"
            f"\n"
            f"- `{switch_site}` no longer reads the PostHog flag — it "
            f"renders the winner directly.\n"
            f"\n"
            f"---\n"
            f"\n"
            f"> Auto-generated by the Helix Architect agent. Merging this "
            f"PR ships zero new behaviour to users; it only removes the "
            f"experimentation scaffolding for a winner that is already at "
            f"100% rollout.\n"
        )

    def _delete_flag_safely(self, flag_key: str) -> bool:
        if not flag_key:
            return False
        try:
            self.posthog.delete_flag(flag_key)
            return True
        except Exception:
            return False

    def _persist_consolidate(
        self, *, experiment_id: str, flag_key: str
    ) -> None:
        now_iso = datetime.now(timezone.utc).isoformat()
        self.db.table("experiments").update(
            {
                "status": "consolidated",
                "consolidated_at": now_iso,
            }
        ).eq("id", experiment_id).execute()

        if flag_key:
            self.db.table("feature_state").update(
                {"status": "shipped_and_consolidated"}
            ).eq("flag_key", flag_key).execute()
