import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import UrgencyTimer from '@/lib/experiments/exp_cart_conv_2026/urgency_timer';

describe('urgency_timer variant', () => {
  it('starts the countdown at 15:00', () => {
    render(<UrgencyTimer />);
    expect(screen.getByTestId('countdown')).toHaveTextContent('15:00');
  });
});
