-- Helix demo seed.
-- Creates the Team20 org, a single user (joa@team20.com),
-- a connected repo, and one experiment already in `running` state
-- so the demo can fast-forward to the Witness step.
--
-- Idempotent: safe to re-run via `supabase db reset`.

------------------------------------------------------------------------------
-- Team20 org
------------------------------------------------------------------------------
insert into organizations (id, name, slug)
values ('00000000-0000-0000-0000-000000000001', 'Team20', 'team20')
on conflict (id) do nothing;

------------------------------------------------------------------------------
-- Demo user (joa@team20.com)
-- We insert directly into auth.users so the FK on public.users(id) is satisfied.
-- Local-dev only; in production users come from Supabase Auth signup.
------------------------------------------------------------------------------
-- GoTrue (Supabase Auth) reads token columns as Go strings — NULLs blow up
-- with "converting NULL to string is unsupported". Insert empty strings.
insert into auth.users (
  instance_id, id, aud, role, email,
  encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at,
  is_sso_user, is_anonymous,
  confirmation_token, recovery_token,
  email_change_token_new, email_change,
  email_change_token_current, phone_change, phone_change_token,
  reauthentication_token
) values (
  '00000000-0000-0000-0000-000000000000',
  '00000000-0000-0000-0000-0000000000a1',
  'authenticated', 'authenticated',
  'joa@team20.com',
  crypt('demo-password', gen_salt('bf')),
  now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{"name":"Joa"}'::jsonb,
  now(), now(),
  false, false,
  '', '',
  '', '',
  '', '', '',
  ''
) on conflict (id) do nothing;

insert into public.users (id, org_id, email, role)
values (
  '00000000-0000-0000-0000-0000000000a1',
  '00000000-0000-0000-0000-000000000001',
  'joa@team20.com',
  'admin'
) on conflict (id) do nothing;

------------------------------------------------------------------------------
-- Connected repo: helix-demo-saas
------------------------------------------------------------------------------
insert into repos (id, org_id, github_repo_full_name)
values (
  '00000000-0000-0000-0000-000000000010',
  '00000000-0000-0000-0000-000000000001',
  'JoaquinGiorgis/helix-demo-saas'
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

------------------------------------------------------------------------------
-- Already-shipped experiment (`exp_checkout_button_2025`).
-- Lives in 'shipped' state with full results so the dashboard has something
-- finished to click into — KPI lift, decision row, merged PR.
------------------------------------------------------------------------------
insert into experiments (
  id, org_id, repo_id, experiment_id, source,
  problem, design, variants, results,
  flag_key, pr_url, status, started_at, shipped_at
) values (
  '00000000-0000-0000-0000-000000000200',
  '00000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000010',
  'exp_checkout_button_2025',
  'human_brief',
  '{
    "type": "cta_clarity",
    "surface_area": "checkout_step_1",
    "description": "Clarificar el CTA del paso 1 del checkout para que más usuarios avancen al paso 2",
    "primary_kpi": "checkout_step1_to_step2_rate",
    "current_value": 0.62,
    "target_lift_pp": 4,
    "guardrail_kpis": ["aov","refund_rate_30d","support_tickets_per_user_7d"]
  }'::jsonb,
  '{
    "primary_kpi": "checkout_step1_to_step2_rate",
    "guardrail_kpis": ["aov","refund_rate_30d","support_tickets_per_user_7d"],
    "traffic_split": [0.5,0.5],
    "min_n_per_arm": 1500,
    "min_observation_days": 7,
    "max_observation_days": 14,
    "decision_rule": "Bayesian Thompson sampling. Winner declared when p(best > control) > 0.95 AND no guardrail breach."
  }'::jsonb,
  '[
    {"variant_key":"control","is_control":true,"hypothesis":"Status quo: CTA dice ''Continuar''","implementation_brief":"No changes"},
    {"variant_key":"explicit_cta","axis":"clarity","hypothesis":"CTA explícito ''Ir a pago seguro'' sube la conversión a paso 2","implementation_brief":"Cambio de copy en el botón principal del paso 1","expected_lift_pp":4}
  ]'::jsonb,
  '{
    "winning_variant": "explicit_cta",
    "p_best_gt_control": 0.987,
    "guardrail_breach": false,
    "samples_per_arm": 1812,
    "variant_verdicts": [
      {"variant_key":"control","is_control":true,"rate":0.621,"samples":1798},
      {"variant_key":"explicit_cta","is_control":false,"rate":0.667,"samples":1826}
    ]
  }'::jsonb,
  'exp_checkout_button_2025',
  'https://github.com/JoaquinGiorgis/helix-demo-saas/pull/1',
  'shipped',
  now() - interval '21 days',
  now() - interval '5 days'
) on conflict (id) do nothing;

-- Decision row (ship_winner) for the shipped experiment.
insert into decisions (
  id, org_id, experiment_id, action, rationale, executed,
  human_required, human_approved_at, created_at
) values (
  '00000000-0000-0000-0000-000000000201',
  '00000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000200',
  'ship_winner',
  'explicit_cta supera al control con p(best > control) = 0.987 y sin breach de guardrails (AOV, refunds y support tickets dentro del rango). Rampeamos a 100% de tráfico.',
  true,
  false,
  now() - interval '5 days',
  now() - interval '5 days'
) on conflict (id) do nothing;
