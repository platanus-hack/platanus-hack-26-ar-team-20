-- Enable Supabase Realtime for the tables the experiment detail page subscribes
-- to. RLS still applies, so subscribers only receive rows in their own org.
-- Idempotent: safe to re-run.

do $$
declare
  t text;
begin
  if not exists (
    select 1 from pg_publication where pubname = 'supabase_realtime'
  ) then
    create publication supabase_realtime;
  end if;

  foreach t in array array['experiments', 'agent_runs', 'decisions']
  loop
    if not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = t
    ) then
      execute format(
        'alter publication supabase_realtime add table public.%I', t
      );
    end if;
  end loop;
end$$;
