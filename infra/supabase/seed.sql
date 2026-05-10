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
-- Demo experiment, fresh in `designing` with design + variants pre-loaded
-- so the demo can replay the full Brief→Lab→Compose→Witness→Director loop
-- from scratch (matches the post-/api/demo/reset shape).
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
  'designing',
  null
) on conflict (id) do nothing;

------------------------------------------------------------------------------
-- Historical, fully-shipped experiment (`exp_search_relevance_2025`).
-- Lives in 'consolidated' state with full results, a merged PR for the
-- winning variant, and a corresponding decision row — so the dashboard has
-- a clearly-finished experiment in a different domain than the cart demo.
------------------------------------------------------------------------------
insert into experiments (
  id, org_id, repo_id, experiment_id, source,
  problem, design, variants, results,
  flag_key, pr_url, status, started_at, shipped_at, consolidated_at
) values (
  '00000000-0000-0000-0000-000000000200',
  '00000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000010',
  'exp_search_relevance_2025',
  'human_brief',
  '{
    "type": "ranking_algo",
    "surface_area": "product_search_results",
    "description": "Mejorar el ranking de resultados de búsqueda con embeddings semánticos para subir search→purchase",
    "primary_kpi": "search_to_purchase_rate",
    "current_value": 0.087,
    "target_lift_pp": 1.5,
    "guardrail_kpis": ["ndcg_at_10","search_latency_p95_ms","zero_result_rate"]
  }'::jsonb,
  '{
    "primary_kpi": "search_to_purchase_rate",
    "guardrail_kpis": ["ndcg_at_10","search_latency_p95_ms","zero_result_rate"],
    "traffic_split": [0.34,0.33,0.33],
    "min_n_per_arm": 2500,
    "min_observation_days": 7,
    "max_observation_days": 14,
    "decision_rule": "Bayesian Thompson sampling. Winner declared when p(best > control) > 0.95 AND no guardrail breach."
  }'::jsonb,
  '[
    {"variant_key":"control","is_control":true,"hypothesis":"Status quo: BM25 keyword ranking","implementation_brief":"No changes"},
    {"variant_key":"semantic_v2","axis":"recall","hypothesis":"SBERT embeddings + cosine re-rank top-50 sube search→purchase +1.7pp por mejor match en queries de cola larga","implementation_brief":"Hook al pipeline de search: re-rank con embeddings","expected_lift_pp":1.7},
    {"variant_key":"learned_to_rank","axis":"learning","hypothesis":"LTR (XGBoost) entrenado con clicks históricos sube +0.9pp por aprovechar señales de comportamiento","implementation_brief":"Modelo LTR servido detrás del search service","expected_lift_pp":0.9}
  ]'::jsonb,
  '{
    "winning_variant": "semantic_v2",
    "p_best_gt_control": 0.992,
    "guardrail_breach": false,
    "samples_per_arm": 2510,
    "variant_verdicts": [
      {"variant_key":"control","is_control":true,"rate":0.087,"samples":2502},
      {"variant_key":"semantic_v2","is_control":false,"rate":0.104,"samples":2516},
      {"variant_key":"learned_to_rank","is_control":false,"rate":0.094,"samples":2498}
    ]
  }'::jsonb,
  'exp_search_relevance_2025',
  'https://github.com/JoaquinGiorgis/helix-demo-saas/pull/4',
  'consolidated',
  now() - interval '24 days',
  now() - interval '10 days',
  now() - interval '3 days'
) on conflict (id) do nothing;

-- Decision row (ship_winner) for the historical experiment.
insert into decisions (
  id, org_id, experiment_id, action, rationale, executed,
  human_required, human_approved_at, created_at
) values (
  '00000000-0000-0000-0000-000000000201',
  '00000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000200',
  'ship_winner',
  'semantic_v2 supera al control con p(best > control) = 0.992 (+1.7pp en search→purchase, +12% en NDCG@10) sin breach de latencia ni de zero-result rate. Rampeamos a 100% de tráfico y consolidamos el cleanup.',
  true,
  false,
  now() - interval '10 days',
  now() - interval '10 days'
) on conflict (id) do nothing;

------------------------------------------------------------------------------
-- Easier-to-grok demo experiments. Three "anyone-on-the-team gets it"
-- bets so the dashboard reads as a real product team's loop, not just a
-- pair of technical bets:
--   * exp_signup_cta_copy_2026     — designing  ("por comenzar")
--   * exp_free_shipping_banner_2026 — consolidated (shipped + cleaned up)
--   * exp_welcome_email_subject_2026 — consolidated (shipped + cleaned up)
------------------------------------------------------------------------------

------------------------------------------------------------------------------
-- exp_signup_cta_copy_2026 — fresh brief, no Lab run yet (status=designing)
------------------------------------------------------------------------------
insert into experiments (
  id, org_id, repo_id, experiment_id, source,
  problem, status
) values (
  '00000000-0000-0000-0000-000000000300',
  '00000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000010',
  'exp_signup_cta_copy_2026',
  'human_brief',
  '{
    "type": "copy_change",
    "surface_area": "homepage_signup_button",
    "description": "Probar copy alternativo en el botón de signup de la home — sospechamos que ''Empezá gratis'' convierte mejor que ''Crear cuenta''",
    "primary_kpi": "signup_completion_rate",
    "current_value": 0.184,
    "target_lift_pp": 4,
    "guardrail_kpis": ["bounce_rate","activation_rate_d1"]
  }'::jsonb,
  'designing'
) on conflict (id) do nothing;

------------------------------------------------------------------------------
-- exp_free_shipping_banner_2026 — banner "Envío gratis sobre $50" en home.
-- Already shipped + consolidated, banner_top wins +3.4pp en cart completion.
------------------------------------------------------------------------------
insert into experiments (
  id, org_id, repo_id, experiment_id, source,
  problem, design, variants, results,
  flag_key, pr_url, status, started_at, shipped_at, consolidated_at
) values (
  '00000000-0000-0000-0000-000000000400',
  '00000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000010',
  'exp_free_shipping_banner_2026',
  'human_brief',
  '{
    "type": "ux_change",
    "surface_area": "homepage_hero",
    "description": "Mostrar un banner ''Envío gratis sobre $50'' en la home sube la conversión cart→completion al subir el AOV target",
    "primary_kpi": "cart_completion_rate",
    "current_value": 0.621,
    "target_lift_pp": 3,
    "guardrail_kpis": ["aov","refund_rate_30d"]
  }'::jsonb,
  '{
    "primary_kpi": "cart_completion_rate",
    "guardrail_kpis": ["aov","refund_rate_30d"],
    "traffic_split": [0.34,0.33,0.33],
    "min_n_per_arm": 2800,
    "min_observation_days": 7,
    "max_observation_days": 14,
    "decision_rule": "Bayesian Thompson sampling. Winner declared when p(best > control) > 0.95 AND no guardrail breach."
  }'::jsonb,
  '[
    {"variant_key":"control","is_control":true,"hypothesis":"Status quo: sin banner de envío gratis","implementation_brief":"No changes"},
    {"variant_key":"banner_top","axis":"value_prop","hypothesis":"Banner azul fijo arriba de la home con ''Envío gratis sobre $50'' sube la conversión por anclar la promesa","implementation_brief":"Componente Banner sticky en el top del layout","expected_lift_pp":3},
    {"variant_key":"banner_floating","axis":"value_prop","hypothesis":"Banner sticky en bottom-right es menos invasivo y captura usuarios al scrollear","implementation_brief":"Componente FloatingBanner anclado al viewport","expected_lift_pp":2}
  ]'::jsonb,
  '{
    "primary_kpi": "cart_completion_rate",
    "winning_variant": "banner_top",
    "experiment_verdict": "winner_declared",
    "p_best_gt_control": 0.981,
    "guardrail_breach": false,
    "n_total": 9015,
    "variant_verdicts": [
      {"variant_key":"control","is_control":true,"n":3000,"conv":1863,"rate":0.621,"p_better_than_control":0.0,"p_is_best":0.02,"guardrail_breach":false,"verdict":"control"},
      {"variant_key":"banner_top","is_control":false,"n":3010,"conv":1972,"rate":0.655,"p_better_than_control":0.981,"p_is_best":0.92,"guardrail_breach":false,"verdict":"winner"},
      {"variant_key":"banner_floating","is_control":false,"n":3005,"conv":1917,"rate":0.638,"p_better_than_control":0.74,"p_is_best":0.06,"guardrail_breach":false,"verdict":"inconclusive"}
    ],
    "narrative": "banner_top supera al control en +3.4pp con p(best > control) = 0.981 sin breach de AOV ni de refund_rate_30d. Lo rampeamos a 100%."
  }'::jsonb,
  'exp_free_shipping_banner_2026',
  'https://github.com/JoaquinGiorgis/helix-demo-saas/pull/7',
  'consolidated',
  now() - interval '20 days',
  now() - interval '8 days',
  now() - interval '2 days'
) on conflict (id) do nothing;

insert into decisions (
  id, org_id, experiment_id, action, rationale, executed,
  human_required, human_approved_at, created_at
) values (
  '00000000-0000-0000-0000-000000000401',
  '00000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000400',
  'ship_winner',
  'banner_top supera al control con p(best > control) = 0.981 (+3.4pp en cart_completion_rate) sin breach de AOV ni de refund_rate_30d. Rampeamos a 100% de tráfico y consolidamos.',
  true,
  false,
  now() - interval '8 days',
  now() - interval '8 days'
) on conflict (id) do nothing;

------------------------------------------------------------------------------
-- exp_welcome_email_subject_2026 — A/B/C de asunto del email de bienvenida.
-- Already shipped + consolidated, "friendly" gana +6.1pp en open rate.
------------------------------------------------------------------------------
insert into experiments (
  id, org_id, repo_id, experiment_id, source,
  problem, design, variants, results,
  flag_key, pr_url, status, started_at, shipped_at, consolidated_at
) values (
  '00000000-0000-0000-0000-000000000500',
  '00000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000010',
  'exp_welcome_email_subject_2026',
  'human_brief',
  '{
    "type": "copy_change",
    "surface_area": "welcome_email",
    "description": "Subir el open rate del email de bienvenida probando 3 asuntos distintos — el actual se siente robótico",
    "primary_kpi": "email_open_rate",
    "current_value": 0.341,
    "target_lift_pp": 5,
    "guardrail_kpis": ["unsubscribe_rate","spam_complaint_rate"]
  }'::jsonb,
  '{
    "primary_kpi": "email_open_rate",
    "guardrail_kpis": ["unsubscribe_rate","spam_complaint_rate"],
    "traffic_split": [0.34,0.33,0.33],
    "min_n_per_arm": 7500,
    "min_observation_days": 5,
    "max_observation_days": 10,
    "decision_rule": "Bayesian Thompson sampling. Winner declared when p(best > control) > 0.95 AND no guardrail breach."
  }'::jsonb,
  '[
    {"variant_key":"control","is_control":true,"hypothesis":"Status quo: ''Bienvenido a Team20 ✨''","implementation_brief":"No changes"},
    {"variant_key":"friendly","axis":"tone","hypothesis":"Tono cercano (''Hola — gracias por sumarte'') sube el open rate por sentirse menos transaccional","implementation_brief":"Cambiar el subject template del welcome email","expected_lift_pp":5},
    {"variant_key":"action_oriented","axis":"urgency","hypothesis":"Asunto orientado a acción (''Tu cuenta ya está lista — empezá ahora'') sube el open por crear sentido de progreso","implementation_brief":"Cambiar el subject template del welcome email","expected_lift_pp":3}
  ]'::jsonb,
  '{
    "primary_kpi": "email_open_rate",
    "winning_variant": "friendly",
    "experiment_verdict": "winner_declared",
    "p_best_gt_control": 0.997,
    "guardrail_breach": false,
    "n_total": 24010,
    "variant_verdicts": [
      {"variant_key":"control","is_control":true,"n":8000,"conv":2728,"rate":0.341,"p_better_than_control":0.0,"p_is_best":0.0,"guardrail_breach":false,"verdict":"control"},
      {"variant_key":"friendly","is_control":false,"n":8010,"conv":3220,"rate":0.402,"p_better_than_control":0.997,"p_is_best":0.96,"guardrail_breach":false,"verdict":"winner"},
      {"variant_key":"action_oriented","is_control":false,"n":8000,"conv":3024,"rate":0.378,"p_better_than_control":0.92,"p_is_best":0.04,"guardrail_breach":false,"verdict":"inconclusive"}
    ],
    "narrative": "friendly supera al control en +6.1pp con p(best > control) = 0.997 sin breach de unsubscribe ni de spam complaints. Lo dejamos como subject default."
  }'::jsonb,
  'exp_welcome_email_subject_2026',
  'https://github.com/JoaquinGiorgis/helix-demo-saas/pull/9',
  'consolidated',
  now() - interval '14 days',
  now() - interval '5 days',
  now() - interval '1 day'
) on conflict (id) do nothing;

insert into decisions (
  id, org_id, experiment_id, action, rationale, executed,
  human_required, human_approved_at, created_at
) values (
  '00000000-0000-0000-0000-000000000501',
  '00000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000500',
  'ship_winner',
  'friendly supera al control con p(best > control) = 0.997 (+6.1pp en email_open_rate) sin breach de unsubscribe_rate ni de spam_complaint_rate. Lo dejamos como subject default y consolidamos.',
  true,
  false,
  now() - interval '5 days',
  now() - interval '5 days'
) on conflict (id) do nothing;
