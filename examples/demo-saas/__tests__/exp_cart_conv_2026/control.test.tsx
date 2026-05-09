import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import Control from '@/lib/experiments/exp_cart_conv_2026/control';

describe('control variant', () => {
  it('renders the confirm booking CTA', () => {
    render(<Control />);
    expect(
      screen.getByRole('button', { name: /confirm booking/i }),
    ).toBeInTheDocument();
  });
});
