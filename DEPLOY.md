# Helix · Deploy guide

Stack a producción:

- **DB / Auth / Realtime** → Supabase Cloud
- **Backend (FastAPI agentes)** → Railway (Docker)
- **Frontend (Next.js dashboard)** → Vercel

Asumimos que ya corrió `supabase db reset --local` y la demo anda
end-to-end con `bash infra/verify-demo.sh`.

---

## 1) Supabase Cloud — DB + Auth + Realtime

1. Andá a <https://supabase.com/dashboard> → **New project**. Anotá la
   región (idealmente `us-east-1` para latencia con Railway/Vercel),
   poné un password fuerte para Postgres.

2. En **Project Settings → API** copiá:
   - `Project URL` → `SUPABASE_URL` (también `NEXT_PUBLIC_SUPABASE_URL`)
   - `anon` public key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `service_role` secret key → `SUPABASE_SERVICE_ROLE_KEY` (server-only)

3. Linkear el repo local al proyecto cloud:

   ```bash
   cd /Users/joaquingiorgis/Desktop/helix/infra
   supabase login                                  # una vez
   supabase link --project-ref <tu-project-ref>    # del dashboard URL
   ```

4. Aplicar las migraciones:

   ```bash
   supabase db push
   ```

   Esto corre `0001_init.sql` y `0002_realtime.sql` en orden.

5. Cargar el seed (Supabase CLI no lo hace automático en cloud):

   ```bash
   # Pegar el contenido de supabase/seed.sql en el SQL Editor del dashboard
   # y ejecutarlo, o por psql:
   PGURL="$(supabase status --output json | jq -r '.DB_URL')"  # local; en cloud:
   PGURL='postgresql://postgres:<DB_PASSWORD>@db.<ref>.supabase.co:5432/postgres'
   psql "$PGURL" -f supabase/seed.sql
   ```

6. **Auth → URL Configuration** del dashboard:
   - Site URL: `https://<tu-app>.vercel.app`
   - Redirect URLs: agregá `https://<tu-app>.vercel.app/auth/callback`

7. Validar en SQL Editor:

   ```sql
   select slug, name from organizations;     -- team20 | Team20
   select email from public.users;           -- joa@team20.com
   select tablename from pg_publication_tables
     where pubname = 'supabase_realtime';    -- agent_runs, decisions, experiments
   ```

---

## 2) Railway — Backend FastAPI

El `Dockerfile` está en `apps/api/Dockerfile`. El context de build es el
**repo root** (necesita `apps/api/` y `packages/prompts/` ambos).

1. <https://railway.app> → **New Project** → **Deploy from GitHub repo** →
   seleccioná este repo.

2. En el servicio creado, **Settings**:
   - **Root Directory**: `/` (vacío, raíz del repo).
   - **Dockerfile Path**: `apps/api/Dockerfile`.
   - Builder: Dockerfile.

3. **Variables** del servicio (todas obligatorias salvo las marcadas opcionales):

   ```
   ANTHROPIC_API_KEY=sk-ant-...
   ANTHROPIC_MODEL=claude-sonnet-4-6

   SUPABASE_URL=https://<ref>.supabase.co
   SUPABASE_SERVICE_ROLE_KEY=eyJ...

   POSTHOG_PROJECT_API_KEY=phc_...
   POSTHOG_PERSONAL_API_KEY=phx_...
   POSTHOG_HOST=https://us.posthog.com
   POSTHOG_PROJECT_ID=417004

   GITHUB_PAT=ghp_...
   GITHUB_DEMO_REPO=JoaquinGiorgis/helix-demo-saas
   # GITHUB_APP_ID / GITHUB_APP_PRIVATE_KEY / GITHUB_APP_INSTALLATION_ID:
   # opcionales, dejá vacíos cuando usás un PAT.

   HELIX_DEMO_MODE=true
   HELIX_FAST_FORWARD_ENABLED=true

   # Allowlist el dominio Vercel para CORS (no necesario para server actions
   # pero útil para debugging desde el browser).
   HELIX_CORS_ORIGINS=https://<tu-app>.vercel.app
   ```

4. Railway expone `$PORT` automático. El `Dockerfile` ya lo usa.
   Después del primer deploy te asigna un dominio
   `https://<servicio>.up.railway.app`. Anotalo, lo necesitás para Vercel.

5. Validar:

   ```bash
   curl https://<servicio>.up.railway.app/healthz
   # {"status":"ok"}
   ```

---

## 3) Vercel — Frontend Next.js

1. <https://vercel.com> → **New Project** → import del mismo repo de GitHub.

2. **Framework preset**: Next.js (auto-detect).
   **Root Directory**: `apps/web`.
   **Install Command**: dejá el default (Vercel detecta el pnpm workspace
   y corre `pnpm install` desde la raíz).
   **Build Command**: `pnpm build` (default).

3. **Environment Variables**:

   ```
   NEXT_PUBLIC_SUPABASE_URL=https://<ref>.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...                # anon pública
   HELIX_API_URL=https://<servicio>.up.railway.app     # Railway URL
   HELIX_FAST_FORWARD_ENABLED=true                     # gate para botones de demo
   ```

   ⚠️ **NO** pongas `SUPABASE_SERVICE_ROLE_KEY` acá — esa solo va en Railway.

4. Deploy. Vercel te da `https://<tu-app>.vercel.app`.

5. **Volvé a Supabase Auth → URL Configuration** y agregá esa URL al
   redirect allowlist (paso 1.6).

---

## 4) Smoke test end-to-end

1. Andá a `https://<tu-app>.vercel.app/login`.
2. Login con `joa@team20.com` / `demo-password`.
3. Vas a ver el modal de bienvenida 5s "leyendo el repo" → te lleva a
   `/team20/experiments/exp_cart_conv_2026`.
4. Click **"Run full demo loop"** → modal animado → en ~30s se completan
   los 7 pasos y aparecen 2 PRs en `JoaquinGiorgis/helix-demo-saas`.

Si el botón Architect falla con 422 "No commits between main and
helix/exp_cart_conv_2026", el branch en el demo repo no tiene los
archivos pre-committeados — pedile al owner del repo que los empuje
desde local antes del demo.

---

## Comandos útiles

| Qué | Cómo |
| --- | --- |
| Re-aplicar migraciones a cloud | `cd infra && supabase db push` |
| Re-cargar seed | `psql "$PGURL" -f supabase/seed.sql` |
| Reset state desde la UI | Botón "Reset" en el panel del experimento |
| Reset state por API | `curl -X POST https://<railway>/demo/reset` |
| Ver logs del backend | `railway logs` o panel web |
| Ver logs del frontend | Panel web de Vercel |

---

## Quitar el demo mode (cuando vaya a prod real)

1. En Railway: `HELIX_DEMO_MODE=false` (saca los stubs determinísticos
   de Lab/Witness/Director y vuelve a llamar a Anthropic).
2. En Railway: `HELIX_FAST_FORWARD_ENABLED=false` (apaga los endpoints
   `/demo/*` y oculta el botón Fast-forward del frontend).
3. El seed de Team20/exp_cart_conv_2026 podés dejarlo o limpiarlo
   según prefieras tener un demo.
