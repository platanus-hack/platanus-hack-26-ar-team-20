# Helix · Supabase (local)

Postgres schema, RLS policies, and demo seed for Helix.

## Layout

```
infra/supabase/
├── config.toml              # Supabase CLI local config
├── migrations/
│   └── 0001_init.sql        # tables + RLS + public.user_org_id() helper
├── seed.sql                 # Team20 org + joa@team20.com + running experiment
└── README.md
```

## Prerequisites

- [Supabase CLI](https://supabase.com/docs/guides/cli/getting-started) ≥ 1.150
- Docker (the CLI runs Postgres + Studio in containers)
- `psql` and `jq` on your `$PATH`

## Quick start

The Supabase CLI looks for its config at `<cwd>/supabase/config.toml`, so run
from `infra/` (not from `infra/supabase/`):

```bash
cd infra
supabase start          # boots local Postgres, Studio, Auth, etc.
supabase db reset       # applies migrations + runs seed.sql
```

`supabase status` prints the local URLs:

- Studio: http://127.0.0.1:54323
- DB: `postgresql://postgres:postgres@127.0.0.1:54322/postgres`
- API: http://127.0.0.1:54321

## Validate the seed

```bash
DB_URL="$(supabase status --output json | jq -r '.DB_URL')"

psql "$DB_URL" -c "select slug, name from organizations;"
psql "$DB_URL" -c "select experiment_id, status from experiments;"
```

Expected:

```
 slug   | name
--------+--------
 team20 | Team20

   experiment_id    | status
--------------------+---------
 exp_cart_conv_2026 | running
```

## Verify schema + RLS

```bash
# 7 tables exist in public
psql "$DB_URL" -c "\dt public.*"

# RLS is enabled on every tenant-scoped table
psql "$DB_URL" -c "
  select relname, relrowsecurity
  from pg_class
  where relnamespace = 'public'::regnamespace
    and relkind = 'r'
  order by relname;
"
```

All seven tables (`organizations`, `users`, `repos`, `feature_state`,
`experiments`, `agent_runs`, `decisions`) should report `relrowsecurity = t`.

## How tenant isolation works

Every tenant table carries `org_id`. RLS uses a single helper:

```sql
create or replace function public.user_org_id() returns uuid
language sql stable security definer set search_path = public
as $$
  select org_id from public.users where id = auth.uid()
$$;
```

Each policy is `using (org_id = public.user_org_id())`. Requests authenticated
as a Team20 user only see Team20 rows; anon sessions see nothing.

The `service_role` key bypasses RLS — use it only from trusted backend code
(workers, API server). Never ship it to the browser.

## Demo identity

| Field         | Value                                  |
| ------------- | -------------------------------------- |
| Org           | `Team20` (`team20`)                    |
| User          | `joa@team20.com` / `demo-password`     |
| Repo          | `JoaquinGiorgis/helix-demo-saas`       |
| Experiment    | `exp_cart_conv_2026` (status `running`)|

The experiment is pre-loaded with a design and 4 variants (`control`,
`recently_seen`, `similar_offer`, `urgency_timer`) so the demo can jump
straight to the Witness step without waiting for upstream agents.

## Resetting

```bash
supabase db reset       # drops, re-applies migrations, re-runs seed.sql
supabase stop           # stops containers
supabase stop --no-backup   # also wipes the volume
```
