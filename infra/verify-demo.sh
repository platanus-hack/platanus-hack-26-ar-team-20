#!/usr/bin/env bash
# Drives the full Helix loop end-to-end via the running FastAPI server:
# Brief → Lab → Architect compose → fast-forward → Witness → Director →
# fast-forward → Architect consolidate.
#
# This script intentionally drives the *seed* experiment (exp_cart_conv_2026)
# rather than creating a fresh row. Why: the demo repo has variant files
# pre-committed only on the helix/exp_cart_conv_2026 branch, so a fresh
# slug would fail at the Architect compose step ("no commits between
# main and helix/<new>"). Reset rehydrates the seed to a clean
# 'designing' state so the loop can replay.
#
# Usage:
#   bash infra/verify-demo.sh
#
# Requires:
#   - apps/api running on $HELIX_API_URL (default http://localhost:8000)
#   - Supabase + the seed loaded (so the Team20 org and repo exist)
#   - jq, curl on PATH

set -euo pipefail

API="${HELIX_API_URL:-http://localhost:8000}"
ORG_ID="00000000-0000-0000-0000-000000000001"
REPO_ID="00000000-0000-0000-0000-000000000010"
EXP_SLUG="exp_cart_conv_2026"

started_ms=$(python3 -c "import time; print(int(time.time()*1000))")

bold()  { printf "\033[1m%s\033[0m\n" "$*"; }
ok()    { printf "\033[32m  ✓\033[0m %s\n" "$*"; }
fail()  { printf "\033[31m  ✗\033[0m %s\n" "$*" >&2; exit 1; }
say()   { printf "  · %s\n" "$*"; }

assert_nonempty() {
  local name="$1"; local value="$2"
  if [[ -z "$value" || "$value" == "null" ]]; then
    fail "$name was empty/null"
  fi
}

bold "Resetting demo state"
curl -fsS -X POST "$API/demo/reset" > /dev/null
ok "demo state cleared"

bold "Step 1 · Brief"
brief_response=$(curl -fsS -X POST "$API/experiments/brief" \
  -H 'content-type: application/json' \
  -d "{\"human_brief\":\"Mejorar la conversion del carrito\",\"org_id\":\"$ORG_ID\",\"repo_id\":\"$REPO_ID\"}")
primary_kpi=$(echo "$brief_response" | jq -r '.interpreted_problem.primary_kpi')
assert_nonempty "primary_kpi" "$primary_kpi"
ok "Brief → primary_kpi=$primary_kpi"

bold "Step 2 · Lab"
lab_response=$(curl -fsS -X POST "$API/experiments/$EXP_SLUG/lab/run" \
  -H 'content-type: application/json' -d '{}')
variants_count=$(echo "$lab_response" | jq '.variants | length')
[[ "$variants_count" -ge 2 ]] || fail "Lab returned <2 variants ($variants_count)"
ok "Lab → ${variants_count} variants"

bold "Step 3 · Architect compose"
compose_response=$(curl -fsS -X POST "$API/experiments/$EXP_SLUG/architect/compose")
pr_url=$(echo "$compose_response" | jq -r '.pr_url')
assert_nonempty "compose.pr_url" "$pr_url"
ok "Architect compose → $pr_url"

bold "Step 4 · Fast-forward (started_at)"
ff1=$(curl -fsS -X POST "$API/demo/fast-forward/$EXP_SLUG" \
  -H 'content-type: application/json' -d '{"days":7,"target":"started_at"}')
new_started=$(echo "$ff1" | jq -r '.started_at')
assert_nonempty "started_at" "$new_started"
ok "started_at → $new_started"

bold "Step 5 · Witness"
witness_response=$(curl -fsS -X POST "$API/experiments/$EXP_SLUG/witness/run" \
  -H 'content-type: application/json' -d '{}')
verdict=$(echo "$witness_response" | jq -r '.experiment_verdict')
winner=$(echo "$witness_response" | jq -r '.winning_variant')
assert_nonempty "verdict" "$verdict"
ok "Witness → verdict=$verdict winner=${winner:-none}"

bold "Step 6 · Director"
director_response=$(curl -fsS -X POST "$API/experiments/$EXP_SLUG/director/run" \
  -H 'content-type: application/json' -d '{}')
first_action=$(echo "$director_response" | jq -r '.decisions[0].action // "none"')
say "first decision action = $first_action"
ok "Director ran"

bold "Step 7 · Fast-forward (shipped_at)"
ff2=$(curl -fsS -X POST "$API/demo/fast-forward/$EXP_SLUG?target=shipped_at&days=7" \
  -H 'content-type: application/json' -d '{}')
new_shipped=$(echo "$ff2" | jq -r '.shipped_at')
assert_nonempty "shipped_at" "$new_shipped"
ok "shipped_at → $new_shipped"

bold "Step 8 · Architect consolidate"
# Consolidate only makes sense if Witness picked a winner. If the verdict
# was 'too_early' / 'inconclusive' (real PostHog data missing in CI), skip
# the cleanup PR rather than failing the script — the rest of the loop
# still validates.
if [[ "$winner" == "null" || -z "$winner" ]]; then
  say "no winning_variant — skipping consolidate (verdict=$verdict)"
else
  consolidate_response=$(curl -fsS -X POST "$API/experiments/$EXP_SLUG/architect/consolidate" \
    -H 'content-type: application/json' -d '{}')
  consolidate_pr=$(echo "$consolidate_response" | jq -r '.pr_url')
  assert_nonempty "consolidate.pr_url" "$consolidate_pr"
  ok "Architect consolidate → $consolidate_pr"
fi

ended_ms=$(python3 -c "import time; print(int(time.time()*1000))")
elapsed=$(( (ended_ms - started_ms) / 1000 ))
bold "End-to-end flow completed in ${elapsed}s"
