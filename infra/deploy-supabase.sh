#!/usr/bin/env bash
# One-shot deploy of the Helix DB to Supabase Cloud:
#   1. Link the local supabase project to the cloud one
#   2. Apply migrations (0001_init.sql + 0002_realtime.sql)
#   3. Run the seed (Team20 org + joa@team20.com + exp_cart_conv_2026)
#
# Usage:
#   bash infra/deploy-supabase.sh <project-ref> <db-password>
#
# Where:
#   project-ref  is the slug from your Supabase dashboard URL
#                (e.g. xyzabc1234567890 from https://supabase.com/dashboard/project/xyzabc1234567890)
#   db-password  is the Postgres password you set when you created the project
#
# Requires: supabase CLI ≥ 1.150, psql, jq

set -euo pipefail

if [[ $# -lt 2 ]]; then
  echo "Usage: bash infra/deploy-supabase.sh <project-ref> <db-password>" >&2
  exit 1
fi

PROJECT_REF="$1"
DB_PASSWORD="$2"

REPO_ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT/infra"

bold() { printf "\033[1m%s\033[0m\n" "$*"; }
ok()   { printf "\033[32m  ✓\033[0m %s\n" "$*"; }
fail() { printf "\033[31m  ✗\033[0m %s\n" "$*" >&2; exit 1; }

bold "Step 1 · Link to Supabase Cloud project ($PROJECT_REF)"
SUPABASE_DB_PASSWORD="$DB_PASSWORD" supabase link --project-ref "$PROJECT_REF" >/dev/null
ok "linked"

bold "Step 2 · Apply migrations (db push)"
SUPABASE_DB_PASSWORD="$DB_PASSWORD" supabase db push
ok "migrations applied"

bold "Step 3 · Load seed.sql"
PG_HOST="db.${PROJECT_REF}.supabase.co"
PG_URL="postgresql://postgres:${DB_PASSWORD}@${PG_HOST}:5432/postgres?sslmode=require"
psql "$PG_URL" -v ON_ERROR_STOP=1 -f supabase/seed.sql
ok "seed applied"

bold "Step 4 · Verify"
psql "$PG_URL" -tA -c "select slug || ' | ' || name from organizations;" | sed 's/^/  · /'
psql "$PG_URL" -tA -c "select email from public.users;" | sed 's/^/  · /'
psql "$PG_URL" -tA -c "select tablename from pg_publication_tables where pubname='supabase_realtime' order by tablename;" | sed 's/^/  · /'

bold "Done."
echo "Next: configure Auth → URL Configuration → add"
echo "    https://<your-vercel-app>.vercel.app/auth/callback"
echo "to the redirect allowlist in the Supabase dashboard."
