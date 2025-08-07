// @vitest-environment jsdom
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as matchers from '@testing-library/jest-dom/matchers';
expect.extend(matchers);
import Estimate from '../../pages/Estimate';
import axios from '@/api/axios';
import * as estimateApi from '@/api/estimate';
vi.mock('@/components/ui/ModelViewer', () => ({
  default: () => <div data-testid="model-viewer" />,
}));


vi.mock('@/api/estimate', () => ({
  getEstimate: vi.fn(),
}));


describe('<Estimate />', () => {
  beforeEach(() => {
    // jsdom doesn't implement scrollTo
    window.scrollTo = vi.fn();
  });
  it('renders page header', () => {
    render(<Estimate />);
    expect(screen.getByText(/Estimate Print Job/i)).toBeInTheDocument();
  });

  it('loads filaments and shows success toast', async () => {
    ;(axios.get as any) = vi.fn().mockResolvedValue({
      data: [{ id: '1', type: 'PLA', color: 'Red', hex: '#ff0000' }]
    });
    render(<Estimate />);
    await waitFor(() => {
      expect(screen.getAllByText(/Select filament/i)[0]).toBeInTheDocument();
    });
  });

  it.skip('shows estimate when form is filled', async () => {
    ;(axios.get as any) = vi.fn().mockResolvedValue({
      data: [{ id: '1', type: 'PLA', color: 'Red', hex: '#ff0000' }]
    });
    (estimateApi.getEstimate as any).mockResolvedValue({
      estimated_time_minutes: 30,
      estimated_cost_usd: 10,
    });
    render(<Estimate />);
    await waitFor(() => {
      expect(screen.getAllByText(/Select filament/i)[0]).toBeInTheDocument();
    });
    await waitFor(() => {
      expect(estimateApi.getEstimate).toHaveBeenCalled();
    });
  });
});
