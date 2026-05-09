'use client';
import { useEffect } from 'react';
import posthog from 'posthog-js';
import { PostHogProvider as PHProvider } from 'posthog-js/react';

let initialized = false;

export function PostHogProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    if (initialized || typeof window === 'undefined') return;
    initialized = true;
    posthog.init(
      process.env.NEXT_PUBLIC_POSTHOG_KEY ?? 'phc_demo_placeholder',
      {
        api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST ?? 'https://us.i.posthog.com',
        autocapture: false,
        capture_pageview: false,
        bootstrap: {
          featureFlags: { exp_cart_conv_2026: 'control' },
        },
      },
    );
  }, []);

  return <PHProvider client={posthog}>{children}</PHProvider>;
}
