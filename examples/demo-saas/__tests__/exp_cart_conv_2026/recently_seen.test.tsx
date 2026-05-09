import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import RecentlySeen from '@/lib/experiments/exp_cart_conv_2026/recently_seen';

describe('recently_seen variant', () => {
  it('shows the live activity social-proof section', () => {
    render(<RecentlySeen />);
    expect(screen.getByText(/live activity/i)).toBeInTheDocument();
  });
});
