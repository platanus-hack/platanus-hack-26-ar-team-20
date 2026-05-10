# Helix

**PM autónomo multi-agente para SaaS.** Detecta oportunidades, diseña y codea experimentos multivariados detrás de un feature flag, mide con muestreo bayesiano de Thompson, despliega la ganadora y **borra del codebase las variantes perdedoras y el flag retirado** — cero deuda técnica.

---

## El problema

Los equipos de producto en SaaS pierden semanas entre detectar una oportunidad, diseñar un test, implementarlo, esperar resultados y limpiar el código. La mayoría de los experimentos nunca se limpian: el feature flag queda vivo, las variantes perdedoras siguen en el repo, y la deuda técnica crece con cada iteración.

## Qué hace Helix

Helix corre el ciclo de experimentación end-to-end con agentes especializados:

1. **Indexer** mantiene un mapa vivo del codebase y del estado de cada feature.
2. **Pulse** detecta oportunidades automáticas a partir de eventos de PostHog cada 24 h.
3. **Brief** acepta un prompt humano ("mejorar conversión del carrito") y lo convierte en un problema accionable.
4. **Lab** diseña hasta 4 variantes y pre-registra el experimento (métrica primaria, MDE, criterios de stop) — el diseño queda congelado.
5. **Architect (compose)** abre un PR en GitHub con las variantes implementadas detrás de un flag multivariado de PostHog.
6. **Witness** lee los eventos de PostHog y corre Thompson sampling multi-arm bayesiano para estimar la probabilidad de que cada variante sea la mejor.
7. **Director** ejecuta la decisión: rampa la ganadora al 100% según política.
8. **Architect (consolidate)** abre un PR de cleanup que **borra las variantes perdedoras**, inlinea la ganadora, elimina el flag y mueve el código fuera de `lib/experiments/`.

## La narrativa de 5 cards

Cada experimento se ve en el dashboard como 5 cards:

1. **What we work on** — el problema (Pulse o Brief).
2. **What we test** — las variantes (Lab).
3. **How we test** — el diseño pre-registrado (Lab, congelado).
4. **What worked** — la tabla bayesiana multi-arm (Witness).
5. **Final decision + cleanup** — ramp de la ganadora + PR de cleanup (Director + Architect).

## Stack

- **Frontend**: Next.js 15 (App Router) + TypeScript + Tailwind v4 + shadcn/ui.
- **Backend**: Python 3.12 + FastAPI + uv + Anthropic SDK.
- **Datos / Auth / Realtime**: Supabase.
- **Feature flags + analytics**: PostHog Cloud.
- **GitHub**: GitHub App + PyGithub.
- **LLM**: Claude Sonnet 4.6 para todos los agentes.
- **Hosting**: Vercel (frontend) + Railway (backend).

## Por qué importa

El loop completo — detectar, testear, decidir, limpiar — corre sin intervención humana salvo la aprobación de PRs. La parte más diferenciada es el **cleanup**: en la mayoría de las plataformas de experimentación el código sucio se acumula. Helix lo elimina como parte del ciclo, no como tarea aparte.

## Demo (PH26 ARG)

1. Abrís `/team20/experiments/new` y escribís "Mejorar conversión del carrito".
2. Brief → Lab → Architect compose corren en vivo, las primeras 3 cards se llenan, aparece el PR en GitHub.
3. **Fast-forward 7d** dispara Witness con datos sembrados de PostHog → card 4 muestra la tabla bayesiana.
4. Director ejecuta la decisión, Architect consolidate abre el PR de cleanup → card 5 muestra los archivos borrados y el flag eliminado.

Repositorio: `platanus-hack-26-ar-team-20`. Equipo 20.
