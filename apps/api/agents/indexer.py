from __future__ import annotations

import json
import os
import re
import shutil
import subprocess
import time
from datetime import datetime, timezone
from pathlib import Path

from anthropic import AsyncAnthropic
from pydantic import ValidationError

from agents.base import BaseAgent
from agents.schemas import IndexerInput, IndexerOutput
from core.github_client import GitHubClient
from core.posthog_client import PostHogClient


IGNORED_DIRS = {
    "node_modules",
    ".git",
    "dist",
    "build",
    "__pycache__",
    ".next",
    ".venv",
    "venv",
    ".turbo",
    ".cache",
}


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def summarize_tree(path: Path, max_depth: int = 3, max_files: int = 200) -> str:
    if not path.exists():
        return "(empty)"
    lines: list[str] = []
    truncated = 0
    root_parts = len(path.parts)
    for current_root, dirs, files in os.walk(path):
        rel = Path(current_root).relative_to(path)
        depth = 0 if rel == Path(".") else len(rel.parts)
        if depth > max_depth:
            dirs[:] = []
            continue
        dirs[:] = sorted(d for d in dirs if d not in IGNORED_DIRS)
        for f in sorted(files):
            if len(lines) >= max_files:
                truncated += 1
                continue
            indent = "  " * depth
            rel_file = (rel / f).as_posix() if rel != Path(".") else f
            lines.append(f"{indent}{rel_file}")
    if not lines:
        return "(empty)"
    if truncated:
        lines.append(f"... ({truncated} more)")
    return "\n".join(lines)


def extract_json(text: str) -> str:
    fenced_json = re.search(r"```json\s*(\{.*?\})\s*```", text, re.DOTALL)
    if fenced_json:
        return fenced_json.group(1)
    fenced_plain = re.search(r"```\s*(\{.*?\})\s*```", text, re.DOTALL)
    if fenced_plain:
        return fenced_plain.group(1)
    first = text.find("{")
    last = text.rfind("}")
    if first != -1 and last != -1 and last > first:
        return text[first : last + 1]
    raise ValueError("no JSON object found in agent output")


def _count_files(path: Path) -> int:
    total = 0
    for current_root, dirs, files in os.walk(path):
        dirs[:] = [d for d in dirs if d not in IGNORED_DIRS]
        total += len(files)
    return total


def _safe_path(repo_path: Path, rel: str) -> Path | None:
    candidate = (repo_path / rel).resolve()
    try:
        candidate.relative_to(repo_path.resolve())
    except ValueError:
        return None
    return candidate


def _run_ripgrep(repo_path: Path, pattern: str, max_results: int = 100) -> str:
    try:
        proc = subprocess.run(
            [
                "rg",
                "--no-heading",
                "-n",
                "--max-count",
                str(max_results),
                pattern,
                str(repo_path),
            ],
            capture_output=True,
            text=True,
            timeout=15,
        )
    except FileNotFoundError:
        return _python_grep(repo_path, pattern, max_results)
    except subprocess.TimeoutExpired:
        return "<grep timed out>"
    out = proc.stdout or ""
    if len(out) > 8192:
        out = out[:8192] + "\n... (truncated)"
    if not out and proc.returncode not in (0, 1):
        return f"<rg error: {proc.stderr.strip()[:200]}>"
    return out or "<no matches>"


def _python_grep(repo_path: Path, pattern: str, max_results: int) -> str:
    try:
        regex = re.compile(pattern)
    except re.error as e:
        return f"<invalid regex: {e}>"
    matches: list[str] = []
    for current_root, dirs, files in os.walk(repo_path):
        dirs[:] = [d for d in dirs if d not in IGNORED_DIRS]
        for f in files:
            full = Path(current_root) / f
            try:
                with full.open("r", encoding="utf-8", errors="ignore") as fp:
                    for lineno, line in enumerate(fp, 1):
                        if regex.search(line):
                            rel = full.relative_to(repo_path).as_posix()
                            matches.append(f"{rel}:{lineno}:{line.rstrip()}")
                            if len(matches) >= max_results:
                                return "\n".join(matches)
            except OSError:
                continue
    return "\n".join(matches) if matches else "<no matches>"


def _summarize_flags(flags: list[dict]) -> list[dict]:
    summary: list[dict] = []
    for f in flags:
        filters = f.get("filters") or {}
        groups = filters.get("groups") or []
        rollout = groups[0].get("rollout_percentage") if groups else None
        summary.append(
            {
                "key": f.get("key"),
                "active": f.get("active"),
                "rollout": rollout,
            }
        )
    return summary


# ---------------------------------------------------------------------------
# Tool definitions for Anthropic
# ---------------------------------------------------------------------------
TOOL_DEFS = [
    {
        "name": "read_file",
        "description": "Read a file from the cloned repo by path relative to repo root.",
        "input_schema": {
            "type": "object",
            "properties": {"path": {"type": "string"}},
            "required": ["path"],
        },
    },
    {
        "name": "grep_code",
        "description": "Search the cloned repo with a ripgrep regex pattern.",
        "input_schema": {
            "type": "object",
            "properties": {"pattern": {"type": "string"}},
            "required": ["pattern"],
        },
    },
]


# ---------------------------------------------------------------------------
# Agent
# ---------------------------------------------------------------------------
class IndexerAgent(BaseAgent):
    name = "indexer"
    model = "claude-sonnet-4-6"
    MAX_TOOL_ITERS = 20

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
        input_data: IndexerInput,
        *,
        org_id: str,
        experiment_id: str | None = None,
    ) -> IndexerOutput:
        start = time.monotonic()
        tokens_in = 0
        tokens_out = 0
        repo_path = self.github.clone_repo(input_data.repo_full_name)
        try:
            existing_flags = self.posthog.list_feature_flags()
            flags_summary = _summarize_flags(existing_flags)
            file_tree = summarize_tree(repo_path, max_depth=3, max_files=200)
            files_scanned = _count_files(repo_path)

            user_message = (
                f"Repo: {input_data.repo_full_name}\n"
                f"since_sha: {input_data.since_sha or 'null'}\n\n"
                f"File tree (summary):\n{file_tree}\n\n"
                f"Existing feature flags in PostHog:\n"
                f"{json.dumps(flags_summary, indent=2)}\n\n"
                "Use the read_file and grep_code tools to investigate the repo. "
                "Find features (user-facing capabilities), flag references in code, "
                "orphan flags, and graduated flags. "
                "Return ONLY the JSON schema specified in your system prompt."
            )

            messages: list[dict] = [{"role": "user", "content": user_message}]
            resp = None
            completed = False

            for _ in range(self.MAX_TOOL_ITERS):
                resp = await self.client.messages.create(
                    model=self.model,
                    max_tokens=8000,
                    system=self._load_prompt(),
                    messages=messages,
                    tools=TOOL_DEFS,
                )
                tokens_in += resp.usage.input_tokens
                tokens_out += resp.usage.output_tokens

                if resp.stop_reason != "tool_use":
                    completed = True
                    break

                messages.append({"role": "assistant", "content": resp.content})

                tool_results = []
                for block in resp.content:
                    if getattr(block, "type", None) != "tool_use":
                        continue
                    name = block.name
                    args = block.input or {}
                    if name == "read_file":
                        rel = args.get("path", "")
                        p = _safe_path(repo_path, rel)
                        if p and p.is_file():
                            try:
                                content = p.read_text(errors="ignore")[:200_000]
                            except OSError as e:
                                content = f"<read error: {e}>"
                        else:
                            content = "<not found or forbidden>"
                    elif name == "grep_code":
                        content = _run_ripgrep(repo_path, args.get("pattern", ""))
                    else:
                        content = f"<unknown tool: {name}>"

                    tool_results.append(
                        {
                            "type": "tool_result",
                            "tool_use_id": block.id,
                            "content": content,
                        }
                    )

                messages.append({"role": "user", "content": tool_results})

            if not completed:
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
                    error="tool_loop_exceeded",
                )
                raise RuntimeError("indexer tool loop exceeded MAX_TOOL_ITERS")

            final_text = next(
                (b.text for b in resp.content if getattr(b, "type", None) == "text"),
                "",
            )

            try:
                output = IndexerOutput.model_validate_json(extract_json(final_text))
            except (ValueError, ValidationError) as e:
                duration_ms = int((time.monotonic() - start) * 1000)
                await self._audit(
                    org_id=org_id,
                    experiment_id=experiment_id,
                    input_data=input_data,
                    output_data={"raw": final_text[:4000]},
                    tokens_in=tokens_in,
                    tokens_out=tokens_out,
                    duration_ms=duration_ms,
                    status="error",
                    error=f"invalid_json: {e}",
                )
                raise ValueError(f"indexer returned invalid output: {e}") from e

            output.stats.scan_duration_ms = int((time.monotonic() - start) * 1000)
            output.stats.files_scanned = files_scanned

            self._upsert_feature_state(
                org_id=org_id,
                repo_id=input_data.repo_id,
                output=output,
            )

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
        finally:
            shutil.rmtree(repo_path, ignore_errors=True)

    def _upsert_feature_state(
        self,
        *,
        org_id: str,
        repo_id: str,
        output: IndexerOutput,
    ) -> None:
        now = datetime.now(timezone.utc).isoformat()

        def _row(feat, *, override_status: str | None = None) -> dict:
            return {
                "org_id": org_id,
                "repo_id": repo_id,
                "feature_name": feat.feature_name,
                "flag_key": feat.flag_key,
                "status": override_status or feat.status,
                "rollout_pct": feat.rollout_pct,
                "source_files": feat.source_files,
                "updated_at": now,
            }

        upsert_rows = [
            _row(f) for f in (output.delta.added + output.delta.modified)
        ]
        killed_rows = [
            _row(f, override_status="killed") for f in output.delta.removed
        ]

        if upsert_rows:
            self.db.table("feature_state").upsert(
                upsert_rows, on_conflict="repo_id,feature_name"
            ).execute()
        if killed_rows:
            self.db.table("feature_state").upsert(
                killed_rows, on_conflict="repo_id,feature_name"
            ).execute()
