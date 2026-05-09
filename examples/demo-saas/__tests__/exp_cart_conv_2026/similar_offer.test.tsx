import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import SimilarOffer from '@/lib/experiments/exp_cart_conv_2026/similar_offer';

describe('similar_offer variant', () => {
  it('renders cross-sell offer suggestions', () => {
    render(<SimilarOffer />);
    expect(
      screen.getByText(/people who booked this also chose/i),
    ).toBeInTheDocument();
  });
});
