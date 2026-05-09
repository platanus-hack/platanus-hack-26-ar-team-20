-- Helix initial schema: multi-tenant tables, RLS policies, and helper functions.
-- All tenant-scoped tables carry org_id and are isolated via public.user_org_id().

------------------------------------------------------------------------------
-- Extensions
------------------------------------------------------------------------------
create extension if not exists "uuid-ossp";
create extension if not exists "pgcrypto";
create extension if not exists "vector";

------------------------------------------------------------------------------
-- Tables
------------------------------------------------------------------------------

-- organizations: top-level tenant
create table organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text unique not null,
  github_installation_id bigint,
  policy jsonb not null default '{
    "risk_tolerance": "balanced",
    "max_blast_radius_pct": 50,
    "require_human_approval_above_pct": 50,
    "auto_merge_consolidation": false,
    "kill_protected_flags": []
  }'::jsonb,
  created_at timestamptz not null default now()
);

-- users: app-level user, mapped 1:1 with auth.users
create table users (
  id uuid primary key references auth.users(id) on delete cascade,
  org_id uuid not null references organizations(id) on delete cascade,
  email text not null,
  role text not null default 'admin' check (role in ('admin','member','viewer')),
  created_at timestamptz not null default now()
);
create index users_org_id_idx on users(org_id);

-- repos: a github repository connected to an org
create table repos (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  github_repo_full_name text not null,
  default_branch text not null default 'main',
  flag_provider text not null default 'posthog',
  analytics_provider text not null default 'posthog',
  created_at timestamptz not null default now(),
  unique(org_id, github_repo_full_name)
);
create index repos_org_id_idx on repos(org_id);

-- feature_state: features detected by the Indexer
create table feature_state (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  repo_id uuid not null references repos(id) on delete cascade,
  feature_name text not null,
  flag_key text,
  status text not null check (status in (
    'behind_flag','shipped','shipped_and_consolidated','killed',
    'proposed','orphan_flag','graduated_flag'
  )),
  rollout_pct numeric not null default 0,
  source_files text[],
  embedding vector(1536),
  updated_at timestamptz not null default now(),
  unique(repo_id, feature_name)
);
create index feature_state_org_id_idx on feature_state(org_id);
create index feature_state_repo_id_idx on feature_state(repo_id);
create index feature_state_status_idx on feature_state(status);

-- experiments: full lifecycle of an experiment
create table experiments (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  repo_id uuid not null references repos(id) on delete cascade,
  experiment_id text unique not null,
  source text not null check (source in ('pulse','human_brief')),
  problem jsonb not null,
  design jsonb,
  variants jsonb,
  pr_url text,
  flag_key text,
  status text not null default 'designing' check (status in (
    'designing','implementing','running','analyzing',
    'shipped','consolidating','consolidated','killed'
  )),
  results jsonb,
  winning_variant text,
  started_at timestamptz,
  shipped_at timestamptz,
  consolidated_at timestamptz,
  created_at timestamptz not null default now()
);
create index experiments_org_id_idx on experiments(org_id);
create index experiments_repo_id_idx on experiments(repo_id);
create index experiments_status_idx on experiments(status);

-- agent_runs: audit log of every agent invocation
create table agent_runs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  repo_id uuid references repos(id) on delete set null,
  experiment_id uuid references experiments(id) on delete set null,
  agent text not null,
  model text not null,
  input jsonb,
  output jsonb,
  tokens_in int not null default 0,
  tokens_out int not null default 0,
  cost_usd numeric not null default 0,
  duration_ms int,
  status text not null default 'success' check (status in ('success','error','human_required')),
  error text,
  created_at timestamptz not null default now()
);
create index agent_runs_org_id_idx on agent_runs(org_id);
create index agent_runs_experiment_id_idx on agent_runs(experiment_id);
create index agent_runs_created_at_idx on agent_runs(created_at desc);

-- decisions: every meaningful action, with human-approval audit trail
create table decisions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  experiment_id uuid references experiments(id) on delete set null,
  action text not null,
  before_state jsonb,
  after_state jsonb,
  rationale text,
  executed boolean not null default false,
  human_required boolean not null default false,
  human_approved_by uuid references users(id) on delete set null,
  human_approved_at timestamptz,
  reversible_until timestamptz,
  created_at timestamptz not null default now()
);
create index decisions_org_id_idx on decisions(org_id);
create index decisions_experiment_id_idx on decisions(experiment_id);

------------------------------------------------------------------------------
-- Helpers
------------------------------------------------------------------------------

-- Resolves the authenticated user's org_id from the public.users table.
-- Lives in public (not auth) because Supabase migrations run as the `postgres`
-- role, which lacks privileges to create objects in the auth schema.
-- Marked security definer so it bypasses RLS on public.users when called.
create or replace function public.user_org_id() returns uuid
language sql stable security definer set search_path = public
as $$
  select org_id from public.users where id = auth.uid()
$$;

revoke all on function public.user_org_id() from public;
grant execute on function public.user_org_id() to authenticated, anon, service_role;

------------------------------------------------------------------------------
-- Row Level Security
------------------------------------------------------------------------------

alter table organizations  enable row level security;
alter table users          enable row level security;
alter table repos          enable row level security;
alter table feature_state  enable row level security;
alter table experiments    enable row level security;
alter table agent_runs     enable row level security;
alter table decisions      enable row level security;

create policy own_org           on organizations  using (id     = public.user_org_id());
create policy own_user          on users          using (org_id = public.user_org_id());
create policy tenant_isolation  on repos          using (org_id = public.user_org_id());
create policy tenant_isolation  on feature_state  using (org_id = public.user_org_id());
create policy tenant_isolation  on experiments    using (org_id = public.user_org_id());
create policy tenant_isolation  on agent_runs     using (org_id = public.user_org_id());
create policy tenant_isolation  on decisions      using (org_id = public.user_org_id());
