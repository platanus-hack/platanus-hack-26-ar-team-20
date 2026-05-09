'use client';
import { useFeatureFlagVariantKey } from 'posthog-js/react';
import Control, { type CartProps } from '@/lib/experiments/exp_cart_conv_2026/control';
import RecentlySeen from '@/lib/experiments/exp_cart_conv_2026/recently_seen';
import SimilarOffer from '@/lib/experiments/exp_cart_conv_2026/similar_offer';
import UrgencyTimer from '@/lib/experiments/exp_cart_conv_2026/urgency_timer';

export function CartSummary(props: CartProps) {
  const variant = useFeatureFlagVariantKey('exp_cart_conv_2026');
  switch (variant) {
    case 'recently_seen': return <RecentlySeen {...props} />;
    case 'similar_offer': return <SimilarOffer {...props} />;
    case 'urgency_timer': return <UrgencyTimer {...props} />;
    case 'control':
    default: return <Control {...props} />;
  }
}
