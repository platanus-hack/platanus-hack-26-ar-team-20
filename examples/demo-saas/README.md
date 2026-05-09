# demo-saas

This directory is the **Helix demo repo** — a stripped-down fork of
[Cal.com](https://github.com/calcom/cal.com) used to show what Helix's Architect
compose card produces when you launch an experiment on the cart-conversion flow.

In a real Architect run, these files would be **generated on demand**. Here, we
pre-load them so the demo is instant — no waiting for code generation.

## What's inside

The experiment `exp_cart_conv_2026` ships **4 variants** behind a multivariate
PostHog feature flag:

| Variant         | What changes                                                                       |
| --------------- | ---------------------------------------------------------------------------------- |
| `control`       | Original Cal.com cart layout — title, price breakdown, confirm button.             |
| `recently_seen` | Adds 3 social-proof cards above the checkout (live booking activity).              |
| `similar_offer` | Adds 2 cross-sell offers between the price breakdown and the confirm button.       |
| `urgency_timer` | Adds a 15-minute countdown banner + scarcity copy ("Solo quedan 2 lugares").       |

The variant switch lives in `apps/web/components/booking/CartSummary.tsx` and uses
[`useFeatureFlagVariantKey`](https://posthog.com/docs/libraries/react) from
`posthog-js/react`.

## Layout

```
examples/demo-saas/
├── apps/web/
│   ├── app/
│   │   ├── cart/page.tsx              ← the route Helix instruments
│   │   ├── layout.tsx
│   │   ├── providers.tsx              ← PostHog client init
│   │   └── globals.css
│   └── components/booking/
│       ├── CartCheckout.tsx           ← page wrapper (sidebar + summary)
│       └── CartSummary.tsx            ← variant switch (the surgery point)
├── lib/experiments/exp_cart_conv_2026/
│   ├── control.tsx
│   ├── recently_seen.tsx
│   ├── similar_offer.tsx
│   └── urgency_timer.tsx
└── __tests__/exp_cart_conv_2026/      ← smoke tests, 1 assertion each
```

## Run it

```bash
cd examples/demo-saas
pnpm install
pnpm test       # smoke tests for each variant
pnpm dev        # http://localhost:3001/cart
```

## Forcing a variant locally

PostHog persists flag overrides in `localStorage`. To walk through the arms
without configuring a real PostHog project, open the dev server in your browser,
then in DevTools console:

```js
posthog.featureFlags.override({ exp_cart_conv_2026: 'recently_seen' });
location.reload();
```

Swap `recently_seen` for `similar_offer`, `urgency_timer`, or `control` to step
through each variant. To clear the override:

```js
posthog.featureFlags.override(false);
```

## Why this is here, not in the parent monorepo

This is a **self-contained** workspace (its own `pnpm-workspace.yaml`) so the
parent Helix monorepo doesn't pull these dev deps. Treat it as a fixture — it
exists to be cloned, instrumented, and shown off in the demo flow.
