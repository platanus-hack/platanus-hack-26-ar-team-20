# Helix

Multi-agent autonomous PM for SaaS startups: detects opportunities, designs and codes
multivariate experiments behind a feature flag, measures with Bayesian Thompson sampling,
ships the winner, and **deletes losing variants from the codebase** so there's zero tech debt.

> Hackathon MVP — PH26 ARG. Optimized for an end-to-end demo, not production.

## Stack

- **Web**: Next.js 15 (App Router) + TypeScript + Tailwind v4 + shadcn/ui + Supabase JS
- **API**: Python 3.12 + FastAPI + uv + Anthropic SDK
- **Data / Auth / Realtime**: Supabase
- **Flags + Analytics**: PostHog Cloud

## Repo layout

```
helix/
├── apps/
│   ├── web/             # Next.js dashboard
│   └── api/             # FastAPI backend with agents
├── packages/
│   ├── shared-types/    # TS types shared between web and API
│   └── prompts/         # Markdown agent system prompts (read at runtime)
├── .env.example
├── pnpm-workspace.yaml
└── package.json
```

## Quickstart (5 steps)

```bash
# 1. Clone
git clone https://github.com/platanus-hack/platanus-hack-26-ar-team-20.git helix
cd helix

# 2. Copy env
cp .env.example .env.local
# fill in Supabase, Anthropic, PostHog and GitHub App keys

# 3. Bring up local Supabase (requires supabase CLI)
supabase start

# 4. Install + run web and api together
pnpm install
pnpm dev                     # starts Next.js on :3000
# in a second terminal:
cd apps/api && uv sync && uv run uvicorn main:app --reload  # starts FastAPI on :8000

# 5. Open the dashboard
open http://localhost:3000
```

The API exposes `GET /healthz` returning `{"status":"ok"}` once it's running.

## Conventions

- Code comments in English, UI strings in Spanish (LatAm).
- All agent numeric outputs validate against a Pydantic schema.
- Every agent run writes a row to `agent_runs` (input, output, tokens, cost, duration).
- Flag keys = `experiment_id` (1:1).
- Branch names: `helix/<experiment_id>` for compose, `helix/consolidate-<experiment_id>-<YYYY-MM-DD>` for cleanup.
- Never commit secrets.
