from __future__ import annotations

from typing import Any

import httpx
import numpy as np
from scipy.stats import beta

from core.config import Settings


class PostHogClient:
    def __init__(self, settings: Settings):
        self._project_id = settings.posthog_project_id
        self._http = httpx.Client(
            base_url=settings.posthog_host.rstrip("/"),
            headers={
                "Authorization": f"Bearer {settings.posthog_personal_api_key}",
                "Content-Type": "application/json",
            },
            timeout=30.0,
        )

    def _flags_url(self, suffix: str = "") -> str:
        return f"/api/projects/{self._project_id}/feature_flags/{suffix}"

    # ------------------------------------------------------------------
    # Feature flag CRUD
    # ------------------------------------------------------------------
    def list_feature_flags(self) -> list[dict]:
        results: list[dict] = []
        url: str | None = self._flags_url()
        while url:
            resp = self._http.get(url)
            resp.raise_for_status()
            payload = resp.json()
            results.extend(payload.get("results", []))
            url = payload.get("next")
            if url and url.startswith("http"):
                # PostHog returns absolute URLs in `next`; strip host so
                # httpx uses the base_url-set scheme/host.
                url = url.split(self._http.base_url.host, 1)[-1]
        return results

    def get_flag(self, key: str) -> dict | None:
        resp = self._http.get(self._flags_url(), params={"search": key})
        resp.raise_for_status()
        for f in resp.json().get("results", []):
            if f.get("key") == key:
                return f
        return None

    def create_multivariate_flag(
        self,
        key: str,
        variants: list[dict],
        rollout_pct: int = 100,
        default: str | None = None,
    ) -> dict:
        body: dict[str, Any] = {
            "key": key,
            "name": key,
            "active": True,
            "filters": {
                "groups": [{"properties": [], "rollout_percentage": rollout_pct}],
                "multivariate": {"variants": variants},
            },
        }
        if default is not None:
            body["filters"]["payloads"] = {default: None}
        resp = self._http.post(self._flags_url(), json=body)
        resp.raise_for_status()
        return resp.json()

    def set_variant_split(self, key: str, splits: dict[str, int]) -> dict:
        flag = self.get_flag(key)
        if flag is None:
            raise ValueError(f"flag not found: {key}")
        filters = flag.get("filters") or {}
        multivariate = filters.get("multivariate") or {}
        variants = multivariate.get("variants") or []
        for v in variants:
            if v["key"] in splits:
                v["rollout_percentage"] = splits[v["key"]]
        multivariate["variants"] = variants
        filters["multivariate"] = multivariate
        resp = self._http.patch(
            self._flags_url(f"{flag['id']}/"),
            json={"filters": filters},
        )
        resp.raise_for_status()
        return resp.json()

    def delete_flag(self, key: str) -> None:
        flag = self.get_flag(key)
        if flag is None:
            return
        # PostHog soft-deletes via PATCH deleted=True; DELETE on flags is
        # not generally supported on cloud, so we use the soft-delete path.
        resp = self._http.patch(
            self._flags_url(f"{flag['id']}/"),
            json={"deleted": True},
        )
        resp.raise_for_status()

    # ------------------------------------------------------------------
    # Events / funnels (HogQL via /query)
    # ------------------------------------------------------------------
    def query_events(
        self,
        *,
        distinct_id_prefix: str,
        event: str,
        since: str,
        until: str,
    ) -> list[dict]:
        hogql = (
            "SELECT distinct_id, event, timestamp, properties "
            "FROM events "
            "WHERE event = {event} "
            "AND startsWith(distinct_id, {prefix}) "
            "AND timestamp >= {since} AND timestamp < {until} "
            "ORDER BY timestamp ASC"
        )
        resp = self._http.post(
            f"/api/projects/{self._project_id}/query/",
            json={
                "query": {
                    "kind": "HogQLQuery",
                    "query": hogql,
                    "values": {
                        "event": event,
                        "prefix": distinct_id_prefix,
                        "since": since,
                        "until": until,
                    },
                }
            },
        )
        resp.raise_for_status()
        payload = resp.json()
        cols = payload.get("columns") or []
        rows = payload.get("results") or []
        return [dict(zip(cols, row, strict=False)) for row in rows]

    def funnel(
        self,
        *,
        steps: list[str],
        since: str,
        until: str,
        breakdown_by_flag: str | None = None,
    ) -> dict:
        body: dict[str, Any] = {
            "insight": "FUNNELS",
            "events": [{"id": s, "type": "events", "order": i} for i, s in enumerate(steps)],
            "date_from": since,
            "date_to": until,
        }
        if breakdown_by_flag:
            body["breakdown_type"] = "event"
            body["breakdown"] = f"$feature/{breakdown_by_flag}"
        resp = self._http.post(
            f"/api/projects/{self._project_id}/insights/funnel/",
            json=body,
        )
        resp.raise_for_status()
        return resp.json()

    # ------------------------------------------------------------------
    # Bayesian / Thompson stats (no network)
    # ------------------------------------------------------------------
    def bayesian_test(
        self,
        *,
        control_n: int,
        control_conv: int,
        variant_n: int,
        variant_conv: int,
        draws: int = 10000,
    ) -> float:
        """Returns p(variant > control) using Beta-binomial Thompson sampling."""
        a_c, b_c = 1 + control_conv, 1 + (control_n - control_conv)
        a_v, b_v = 1 + variant_conv, 1 + (variant_n - variant_conv)
        samples_c = beta.rvs(a_c, b_c, size=draws)
        samples_v = beta.rvs(a_v, b_v, size=draws)
        return float(np.mean(samples_v > samples_c))

    def thompson_multi_arm(
        self,
        *,
        arms: list[dict],
        draws: int = 10000,
    ) -> dict[str, dict[str, float]]:
        """
        arms: [{'key': str, 'n': int, 'conv': int, 'is_control': bool}]
        Returns {arm_key: {'p_better_than_control': float, 'p_is_best': float, 'rate': float}}.
        """
        if not arms:
            return {}
        keys = [a["key"] for a in arms]
        samples = np.empty((len(arms), draws))
        for i, a in enumerate(arms):
            n = int(a["n"])
            c = int(a["conv"])
            samples[i] = beta.rvs(1 + c, 1 + (n - c), size=draws)
        best_idx = samples.argmax(axis=0)
        control_i = next(
            (i for i, a in enumerate(arms) if a.get("is_control")),
            0,
        )
        out: dict[str, dict[str, float]] = {}
        for i, a in enumerate(arms):
            n = int(a["n"]) or 1
            c = int(a["conv"])
            out[keys[i]] = {
                "p_better_than_control": float(np.mean(samples[i] > samples[control_i])),
                "p_is_best": float(np.mean(best_idx == i)),
                "rate": c / n,
            }
        return out

    def close(self) -> None:
        self._http.close()
