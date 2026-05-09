-- Helix demo seed.
-- Creates the Pomelo org, a single user (joa@pomelo.com),
-- a connected repo, and one experiment already in `running` state
-- so the demo can fast-forward to the Witness step.
--
-- Idempotent: safe to re-run via `supabase db reset`.

------------------------------------------------------------------------------
-- Pomelo org
------------------------------------------------------------------------------
insert into organizations (id, name, slug)
values ('00000000-0000-0000-0000-000000000001', 'Pomelo', 'pomelo')
on conflict (id) do nothing;

------------------------------------------------------------------------------
-- Demo user (joa@pomelo.com)
-- We insert directly into auth.users so the FK on public.users(id) is satisfied.
-- Local-dev only; in production users come from Supabase Auth signup.
------------------------------------------------------------------------------
insert into auth.users (
  instance_id, id, aud, role, email,
  encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at,
  is_sso_user, is_anonymous
) values (
  '00000000-0000-0000-0000-000000000000',
  '00000000-0000-0000-0000-0000000000a1',
  'authenticated', 'authenticated',
  'joa@pomelo.com',
  crypt('demo-password', gen_salt('bf')),
  now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{"name":"Joa"}'::jsonb,
  now(), now(),
  false, false
) on conflict (id) do nothing;

insert into public.users (id, org_id, email, role)
values (
  '00000000-0000-0000-0000-0000000000a1',
  '00000000-0000-0000-0000-000000000001',
  'joa@pomelo.com',
  'admin'
) on conflict (id) do nothing;

------------------------------------------------------------------------------
-- Connected repo: pomelo/checkout-svc
------------------------------------------------------------------------------
insert into repos (id, org_id, github_repo_full_name)
values (
  '00000000-0000-0000-0000-000000000010',
  '00000000-0000-0000-0000-000000000001',
  'pomelo/checkout-svc'
) on conflict (org_id, github_repo_full_name) do nothing;

------------------------------------------------------------------------------
-- Demo experiment, already in `running` with design + variants pre-loaded
------------------------------------------------------------------------------
insert into experiments (
  id, org_id, repo_id, experiment_id, source,
  problem, design, variants,
  flag_key, status, started_at
) values (
  '00000000-0000-0000-0000-000000000100',
  '00000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000010',
  'exp_cart_conv_2026',
  'human_brief',
  '{
    "type": "funnel_leak",
    "surface_area": "cart_checkout_flow",
    "description": "Aumentar la conversión cart→checkout para usuarios logueados con productos en el carrito",
    "primary_kpi": "cart_to_checkout_rate",
    "current_value": 0.41,
    "target_lift_pp": 5,
    "guardrail_kpis": ["aov","refund_rate_30d","support_tickets_per_user_7d"]
  }'::jsonb,
  '{
    "primary_kpi": "cart_to_checkout_rate",
    "guardrail_kpis": ["aov","refund_rate_30d","support_tickets_per_user_7d"],
    "traffic_split": [0.25,0.25,0.25,0.25],
    "min_n_per_arm": 1260,
    "min_observation_days": 7,
    "max_observation_days": 14,
    "decision_rule": "Bayesian Thompson sampling. Winner declared when p(best > control) > 0.95 AND no guardrail breach."
  }'::jsonb,
  '[
    {"variant_key":"control","is_control":true,"hypothesis":"Status quo","implementation_brief":"No changes"},
    {"variant_key":"recently_seen","axis":"recall","hypothesis":"Mostrar 3 últimos productos vistos arriba del cart sube +9pp la conversión","implementation_brief":"Componente que lee historial y renderea 3 cards","expected_lift_pp":9},
    {"variant_key":"similar_offer","axis":"cross_sell","hypothesis":"Ofertas de productos similares al del cart suben la AOV y la conversión","implementation_brief":"Componente que llama recomendador y muestra ofertas","expected_lift_pp":4},
    {"variant_key":"urgency_timer","axis":"urgency","hypothesis":"Banner de urgency sube la conversión a corto plazo","implementation_brief":"Banner con countdown 15min","expected_lift_pp":6}
  ]'::jsonb,
  'exp_cart_conv_2026',
  'running',
  now() - interval '6 days'
) on conflict (id) do nothing;
