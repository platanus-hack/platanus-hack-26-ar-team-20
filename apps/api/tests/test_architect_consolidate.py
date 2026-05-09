from __future__ import annotations

import asyncio
from datetime import date
from typing import Any

import pytest

from agents.architect import ArchitectAgent, CONSOLIDATE_SWITCH_SITE
from agents.schemas import (
    ArchitectConsolidateInput,
    ArchitectConsolidateOutput,
)


class _BareArchitect(ArchitectAgent):
    """Architect with no real clients; lets us call helpers in isolation."""

    def __init__(self) -> None:  # noqa: D401 — bypass BaseAgent.__init__
        pass


# ---------------------------------------------------------------------------
# Pure helpers
# ---------------------------------------------------------------------------


def test_pascal_case_handles_common_shapes():
    assert ArchitectAgent._pascal_case("variant_a") == "VariantA"
    assert ArchitectAgent._pascal_case("control") == "Control"
    assert ArchitectAgent._pascal_case("big-cta") == "BigCta"
    assert ArchitectAgent._pascal_case("multi__word_thing") == "MultiWordThing"
    assert ArchitectAgent._pascal_case("") == "Winner"


def test_refactor_strips_flag_hook_and_keeps_rest():
    original = """\
import { useFeatureFlagVariantKey } from "posthog-js/react";
import VariantA from "@/lib/experiments/exp_cart_2026/variant_a";
import VariantB from "@/lib/experiments/exp_cart_2026/variant_b";
import Control from "@/lib/experiments/exp_cart_2026/control";
import { Footer } from "@/components/Footer";

export function CartSummary(props: any) {
  const variant = useFeatureFlagVariantKey("exp_cart_2026");
  if (variant === "variant_a") return <VariantA {...props} />;
  if (variant === "variant_b") return <VariantB {...props} />;
  return <Control {...props} />;
}
"""
    out = _BareArchitect()._refactor_switch_to_inline(
        original=original,
        winner="variant_a",
        winner_path="@/lib/cart/variant_a",
        experiment_id="exp_cart_2026",
    )
    assert "useFeatureFlagVariantKey" not in out
    assert "@/lib/experiments/exp_cart_2026/" not in out
    assert 'import VariantA from "@/lib/cart/variant_a";' in out
    assert "<VariantA {...props} />" in out
    # Unrelated import should be preserved.
    assert 'import { Footer } from "@/components/Footer";' in out
    # Banner is added.
    assert out.startswith("// Auto-consolidated by Helix Architect")


def test_refactor_falls_back_to_template_when_no_flag_hook():
    original = "export function CartSummary() { return <div>hi</div>; }\n"
    out = _BareArchitect()._refactor_switch_to_inline(
        original=original,
        winner="variant_a",
        winner_path="@/lib/cart/variant_a",
        experiment_id="exp_cart_2026",
    )
    assert "Auto-consolidated" in out
    assert 'import VariantA from "@/lib/cart/variant_a";' in out
    assert "export default CartSummary;" in out


def test_pr_body_lists_moves_deletes_and_winner_title():
    body = _BareArchitect()._render_consolidate_pr_body(
        input_data=ArchitectConsolidateInput(
            experiment_id="exp_cart_2026",
            winning_variant="variant_a",
            losing_variants=["variant_b", "control"],
            flag_key="exp_cart_2026",
        ),
        files_deleted=[
            "lib/experiments/exp_cart_2026/variant_b.tsx",
            "__tests__/exp_cart_2026/variant_b.test.tsx",
        ],
        files_moved=[
            (
                "lib/experiments/exp_cart_2026/variant_a.tsx",
                "lib/cart/variant_a.tsx",
            ),
        ],
        switch_site=CONSOLIDATE_SWITCH_SITE,
    )
    assert body.startswith("# 🧹 Consolidate exp_cart_2026 — ship `variant_a`")
    assert "**Winner:** `variant_a`" in body
    assert "**Losers:** `variant_b`, `control`" in body
    assert "lib/cart/variant_a.tsx" in body
    assert "variant_b.test.tsx" in body
    assert CONSOLIDATE_SWITCH_SITE in body


# ---------------------------------------------------------------------------
# run_consolidate end-to-end with stub clients
# ---------------------------------------------------------------------------


class _FakeRepoFile:
    def __init__(self, content: str) -> None:
        self.decoded_content = content.encode("utf-8")


class _FakeGitHub:
    def __init__(
        self,
        *,
        files: dict[str, str],
        existing_paths: set[str],
    ) -> None:
        self.files = files
        self.existing_paths = existing_paths
        self.committed: dict[str, Any] | None = None

    def read_file(self, repo: str, path: str) -> str:
        if path in self.files:
            return self.files[path]
        from github import GithubException

        raise GithubException(404, {"message": "not found"}, None)

    def path_exists(self, repo: str, path: str, *, ref: str | None = None) -> bool:
        return path in self.existing_paths

    def commit_files_and_open_pr(
        self,
        *,
        repo: str,
        branch: str,
        base: str,
        files: dict[str, str],
        title: str,
        body: str,
        deletes: list[str] | None = None,
    ) -> str:
        self.committed = {
            "repo": repo,
            "branch": branch,
            "base": base,
            "files": dict(files),
            "deletes": list(deletes or []),
            "title": title,
            "body": body,
        }
        return f"https://github.com/{repo}/pull/42"


class _FakePostHog:
    def __init__(self) -> None:
        self.deleted: list[str] = []

    def delete_flag(self, key: str) -> None:
        self.deleted.append(key)


class _FakeQuery:
    def __init__(self, store: "_FakeSupabase", table: str) -> None:
        self._store = store
        self._table = table
        self._update: dict[str, Any] | None = None
        self._eq: tuple[str, Any] | None = None

    def update(self, payload: dict[str, Any]) -> "_FakeQuery":
        self._update = payload
        return self

    def insert(self, payload: dict[str, Any]) -> "_FakeQuery":
        self._store.inserts.setdefault(self._table, []).append(payload)
        return self

    def select(self, *_args, **_kwargs) -> "_FakeQuery":
        return self

    def or_(self, *_args, **_kwargs) -> "_FakeQuery":
        return self

    def eq(self, column: str, value: Any) -> "_FakeQuery":
        self._eq = (column, value)
        return self

    def limit(self, *_args, **_kwargs) -> "_FakeQuery":
        return self

    def execute(self):
        if self._update is not None:
            self._store.updates.setdefault(self._table, []).append(
                {"set": self._update, "eq": self._eq}
            )
            return type("Resp", (), {"data": []})()
        # Return canned select result.
        return type("Resp", (), {"data": self._store.selects.get(self._table, [])})()


class _FakeSupabase:
    def __init__(self, selects: dict[str, list[dict[str, Any]]]) -> None:
        self.selects = selects
        self.updates: dict[str, list[dict[str, Any]]] = {}
        self.inserts: dict[str, list[dict[str, Any]]] = {}

    def table(self, name: str) -> _FakeQuery:
        return _FakeQuery(self, name)


def _build_agent(
    *,
    files: dict[str, str],
    existing_paths: set[str],
    experiment_row: dict[str, Any],
) -> tuple[ArchitectAgent, _FakeGitHub, _FakePostHog, _FakeSupabase]:
    gh = _FakeGitHub(files=files, existing_paths=existing_paths)
    ph = _FakePostHog()
    db = _FakeSupabase(selects={"experiments": [experiment_row]})
    agent = _BareArchitect()
    agent.github = gh  # type: ignore[attr-defined]
    agent.posthog = ph  # type: ignore[attr-defined]
    agent.db = db  # type: ignore[attr-defined]
    return agent, gh, ph, db


@pytest.fixture(autouse=True)
def _patch_settings(monkeypatch):
    from core.config import settings

    monkeypatch.setattr(
        settings, "github_demo_repo", "fake-org/demo", raising=False
    )
    monkeypatch.setattr(settings, "helix_demo_mode", True, raising=False)


@pytest.fixture(autouse=True)
def _patch_audit(monkeypatch):
    async def _noop_audit(self, **_kwargs):
        return None

    monkeypatch.setattr(ArchitectAgent, "_audit", _noop_audit, raising=True)


def test_run_consolidate_opens_pr_deletes_flag_and_updates_db(monkeypatch):
    slug = "exp_cart_conv_2026"
    files = {
        f"lib/experiments/{slug}/variant_a.tsx": "// winner\n",
        f"lib/experiments/{slug}/variant_b.tsx": "// loser\n",
        f"lib/experiments/{slug}/control.tsx": "// control\n",
        f"__tests__/{slug}/variant_a.test.tsx": "// test winner\n",
        f"__tests__/{slug}/variant_b.test.tsx": "// test loser\n",
        CONSOLIDATE_SWITCH_SITE: (
            'import { useFeatureFlagVariantKey } from "posthog-js/react";\n'
            f'import VariantA from "@/lib/experiments/{slug}/variant_a";\n'
            "export function CartSummary(props: any) {\n"
            f'  const variant = useFeatureFlagVariantKey("{slug}");\n'
            '  if (variant === "variant_a") return <VariantA {...props} />;\n'
            "  return <VariantA {...props} />;\n"
            "}\n"
        ),
    }
    existing = set(files.keys())  # everything in main exists; control test missing
    agent, gh, ph, db = _build_agent(
        files=files,
        existing_paths=existing,
        experiment_row={
            "id": "00000000-0000-0000-0000-000000000001",
            "org_id": "org-1",
            "experiment_id": slug,
            "flag_key": slug,
            "design": {},
            "variants": [],
            "status": "shipped",
        },
    )

    out = asyncio.run(
        agent.run_consolidate(
            ArchitectConsolidateInput(
                experiment_id=slug,
                winning_variant="variant_a",
                losing_variants=["variant_b", "control"],
                flag_key=slug,
            ),
            org_id="org-1",
            experiment_id="00000000-0000-0000-0000-000000000001",
        )
    )

    assert isinstance(out, ArchitectConsolidateOutput)
    assert out.pr_url.endswith("/pull/42")
    assert out.branch == f"helix/consolidate-{slug}-{date.today().isoformat()}"
    assert out.flag_deleted is True
    assert ph.deleted == [slug]

    committed = gh.committed
    assert committed is not None
    assert committed["title"].startswith("🧹 Consolidate winner")
    assert "lib/cart/variant_a.tsx" in committed["files"]
    assert "__tests__/cart/variant_a.test.tsx" in committed["files"]
    assert CONSOLIDATE_SWITCH_SITE in committed["files"]
    # Loser source files should be in deletes; the missing control test is
    # filtered out because path_exists returned False for it.
    deletes = committed["deletes"]
    assert f"lib/experiments/{slug}/variant_b.tsx" in deletes
    assert f"__tests__/{slug}/variant_b.test.tsx" in deletes
    assert f"lib/experiments/{slug}/control.tsx" in deletes
    assert f"__tests__/{slug}/control.test.tsx" not in deletes
    # Winner sources are also deleted (they were moved).
    assert f"lib/experiments/{slug}/variant_a.tsx" in deletes

    # Switch site got the inlined refactor and no longer reads the flag.
    new_switch = committed["files"][CONSOLIDATE_SWITCH_SITE]
    assert "useFeatureFlagVariantKey" not in new_switch
    assert "Auto-consolidated by Helix Architect" in new_switch

    # DB updates: experiments status + feature_state status.
    exp_updates = db.updates.get("experiments", [])
    assert any(u["set"].get("status") == "consolidated" for u in exp_updates)
    fs_updates = db.updates.get("feature_state", [])
    assert any(
        u["set"].get("status") == "shipped_and_consolidated" for u in fs_updates
    )


def test_run_consolidate_skips_missing_winner_files_gracefully(monkeypatch):
    slug = "exp_other"
    # Only the loser exists; winner files are missing in the repo.
    files = {
        f"lib/experiments/{slug}/variant_b.tsx": "// loser\n",
        CONSOLIDATE_SWITCH_SITE: (
            'import { useFeatureFlagVariantKey } from "posthog-js/react";\n'
            "export function CartSummary(props: any) {\n"
            f'  const variant = useFeatureFlagVariantKey("{slug}");\n'
            "  return <div/>;\n"
            "}\n"
        ),
    }
    agent, gh, _ph, _db = _build_agent(
        files=files,
        existing_paths=set(files.keys()),
        experiment_row={
            "id": "00000000-0000-0000-0000-000000000002",
            "org_id": "org-1",
            "experiment_id": slug,
            "flag_key": slug,
            "design": {},
            "variants": [],
            "status": "shipped",
        },
    )

    out = asyncio.run(
        agent.run_consolidate(
            ArchitectConsolidateInput(
                experiment_id=slug,
                winning_variant="variant_a",
                losing_variants=["variant_b"],
                flag_key=slug,
            ),
            org_id="org-1",
            experiment_id="00000000-0000-0000-0000-000000000002",
        )
    )

    # Winner files were missing, so files_moved is empty and only the
    # surviving deletes get committed.
    assert out.files_moved == []
    committed = gh.committed
    assert committed is not None
    assert "lib/cart/variant_a.tsx" not in committed["files"]
    assert CONSOLIDATE_SWITCH_SITE in committed["files"]
    assert (
        f"lib/experiments/{slug}/variant_b.tsx" in committed["deletes"]
    )
