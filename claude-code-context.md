# Helix · Claude Code project context

> Paste this at the start of every Claude Code session. It tells Claude what we're building so each per-prompt task is concise and aligned.

---

## What we're building

**Helix** is a multi-agent system that acts as an autonomous Product Manager for SaaS startups. It detects opportunities (or accepts a human brief), designs multivariate experiments, codes the variants behind a multivariate feature flag, measures with Bayesian Thompson sampling, picks a winner, and **deletes losing variants and retired flags from the codebase** so there's zero technical debt.

**Hackathon context**: PH26 ARG. Demo at 9:00 AM tomorrow. We are building an MVP, not a production system. Optimize for end-to-end flow over breadth. If a piece would take >2 hours and isn't on the demo path, mock it.

## Architecture (MVP, simplified)

```
GitHub App ──webhook──▶ FastAPI (agents) ──▶ Supabase Postgres
                            │                       ▲
                            ▼                       │
                       Anthropic API           Realtime
                            │                       │
                            ▼                       │
                  PostHog (flags + analytics)       │
                                                    │
Next.js Dashboard ◀─────────────────────────────────┘
   (Vercel + shadcn/ui + Supabase JS)
```

**Demo repo**: a fork of [Cal.com](https://github.com/calcom/cal.com) at `examples/demo-saas/`. We instrument 4 variants in the cart conversion flow.

## Stack (committed, no debate)

- **Frontend**: Next.js 15 (App Router) + TypeScript + Tailwind v4 + shadcn/ui + Supabase JS client.
- **Backend**: Python 3.12 + FastAPI + uv (package manager) + Anthropic SDK (`anthropic` v0.40+).
- **DB / Auth / Realtime**: Supabase (one vendor for all of it).
- **Feature flags + analytics**: PostHog Cloud (free tier).
- **GitHub integration**: `PyGithub` (backend) + Octokit (if needed in frontend).
- **Hosting**: Vercel (frontend) + Railway (backend).
- **LLM**: Claude Sonnet 4.6 for all agents (uniform for MVP; mix later).

## Repo layout

```
helix/
├── apps/
│   ├── web/                 # Next.js dashboard
│   └── api/                 # FastAPI backend with agents
├── packages/
│   ├── shared-types/        # TS types shared between web and API (codegen from API)
│   └── prompts/             # Markdown files with agent system prompts (read at runtime)
├── examples/
│   └── demo-saas/           # Cal.com fork, our demo target repo
├── infra/
│   ├── supabase/
│   │   ├── migrations/      # SQL files
│   │   └── seed.sql
│   └── posthog/
│       └── seed.ts          # Seeds the demo experiment in PostHog
├── .env.example
├── README.md
└── pnpm-workspace.yaml
```

## The five-step experiment narrative (the demo)

Every experiment Helix runs renders as 5 cards in the UI:

1. **What we work on** — problem (from Pulse auto-detect or human Brief).
2. **What we test** — variants (from Lab).
3. **How we test** — pre-registered design (from Lab, frozen).
4. **What worked** — Witness multi-arm Bayesian results.
5. **Final decision + cleanup** — Director ramps winner, Architect consolidate-mode opens a cleanup PR (delete flag, delete losing variants, inline winner, rename out of `lib/experiments/`).

Build everything with these 5 cards in mind. The whole demo walks through them.

## Agents (high-level)

| Agent | Trigger | Model | Reads from | Writes to |
|---|---|---|---|---|
| Indexer | GitHub push webhook + 06:00 UTC cron | Sonnet 4.6 | repo files | `feature_state` |
| Brief | human prompt in `/[org]/experiments/new` | Sonnet 4.6 | repo metadata + KPI catalog | `experiments.problem` |
| Pulse | scheduled (every 24h) | Sonnet 4.6 | PostHog API | `experiments.problem` (auto mode) |
| Lab | after Brief or Pulse | Sonnet 4.6 | feature_state + product context | `experiments.design` (frozen) |
| Architect (compose) | after Lab | Sonnet 4.6 | repo files | GitHub PR + flag in PostHog |
| Witness | 7d after deploy + daily | Sonnet 4.6 | PostHog events | `experiments.results` |
| Director | after Witness | Sonnet 4.6 | Witness output + policy | PostHog flag changes + `decisions` table |
| Architect (consolidate) | 7d after `ship_winner` | Sonnet 4.6 | repo files + flag state | GitHub cleanup PR + flag delete |

## Demo path (what must work end-to-end on stage)

1. User opens `/pomelo/experiments/new`, types "Mejorar conversión del carrito" → Brief returns problem card live.
2. Lab runs → 4 variants appear in card 2 + design appears in card 3.
3. Architect compose runs → PR shows up in card 5 with link to GitHub.
4. **Fast-forward 7d button** triggers Witness with seeded PostHog data → card 4 fills with the multi-arm table.
5. Director executes → card 5 updates with `ship_winner` action.
6. Architect consolidate runs → cleanup PR shows in card 5 (deleted files, deleted flag).

**If a real piece breaks during demo**, the fast-forward button uses pre-computed snapshots from the seed. Loom backup recorded at midnight Saturday as last-line defense.

## Conventions

- **All numeric outputs from agents must validate against a Pydantic schema** — never trust a raw LLM output.
- **Every agent run** writes a row to `agent_runs` (input, output, tokens, cost, duration). This powers the audit log and the "Helix is thinking" UI feedback.
- **Flag keys** = `experiment_id` (1:1). Don't make up other keys.
- **Branch names** = `helix/<experiment_id>` for compose, `helix/consolidate-<experiment_id>-<YYYY-MM-DD>` for cleanup.
- **Never commit secrets**. Use `.env.local` and `process.env`.

## What we are NOT building (scope discipline)

- ❌ Production-grade auth flows beyond Supabase magic link.
- ❌ Multi-org switcher (single org per session is fine).
- ❌ Billing.
- ❌ More than one flag provider in code (PostHog only).
- ❌ More than one analytics provider (PostHog only).
- ❌ Real LangGraph state machine (a sequential async function with try/catch is enough).
- ❌ Tests beyond happy-path smoke tests.
- ❌ i18n (Spanish UI is fine, English code).
- ❌ White label.

## Tone for code comments and UI text

- Comments in English. UI strings in **Spanish** (target market is LatAm).
- No emoji in code or commits. UI is allowed minimal Tabler icons.
- No marketing fluff in error messages — be concrete ("PostHog API key invalid" not "Something went wrong").

## Done = demo works end-to-end three times in a row at 03:00 AM

That's the definition of done. If we have time after, we polish. We do not add features.