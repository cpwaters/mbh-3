import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { Listing } from '@mbh/domain';
import SharedLoadPage, { codeFromPath } from './SharedLoadPage';

const sharedLoad = vi.fn();
vi.mock('../lib/reader', () => ({ getReader: () => ({ sharedLoad: (code: string) => sharedLoad(code) }) }));

const listing: Listing = {
  loadId: 'load-1',
  shipperTenantId: 'shipper-1',
  origin: { town: 'Preston', postcode: 'PR1 2AB' },
  destination: { town: 'Blackpool', postcode: 'FY1 1AA' },
  description: 'Mixed groceries',
  weightKg: 12000,
  palletCount: 10,
  priceGbpPence: 55000,
  pickupBy: '2026-08-06',
  deliverBy: '2026-08-07',
  postedAt: '2026-08-01T09:00:00.000Z',
  vehicleSizes: ['artic'],
  vehicleTypes: ['refrigerated'],
  adrRequired: true,
};

function at(path: string) {
  window.history.pushState({}, '', path);
  return render(<SharedLoadPage />);
}

afterEach(() => {
  sharedLoad.mockReset();
  window.history.pushState({}, '', '/');
});

describe('the shared load page', () => {
  it('reads only a well-formed code from the address', () => {
    expect(codeFromPath('/l/AbC12345')).toBe('AbC12345');
    expect(codeFromPath('/l/AbC12345/')).toBe('AbC12345');
    expect(codeFromPath('/l/short')).toBeNull();
    expect(codeFromPath('/l/AbC12345/extra')).toBeNull();
    expect(codeFromPath('/app/')).toBeNull();
  });

  it('shows the load as carriers see it, and the way in to accept it', async () => {
    sharedLoad.mockResolvedValue({ status: 'available', listing });
    at('/l/AbC12345');
    expect(await screen.findByText('Backhaul available')).toBeInTheDocument();
    expect(sharedLoad).toHaveBeenCalledWith('AbC12345');
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/Preston.*Blackpool/);
    expect(screen.getByText('PR1 2AB to FY1 1AA')).toBeInTheDocument();
    expect(screen.getByText('£550.00')).toBeInTheDocument();
    expect(screen.getByText('Artic · Refrigerated')).toBeInTheDocument();
    expect(screen.getByText('ADR')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Sign in to accept' })).toHaveAttribute('href', '/app/');
    expect(screen.getByRole('link', { name: 'New here? Join as a haulier' })).toHaveAttribute('href', '/app/signup/carrier');
  });

  it('says when the load has gone, and when the link is wrong, without asking the store about a bad code', async () => {
    sharedLoad.mockResolvedValue({ status: 'gone' });
    const { unmount } = at('/l/AbC12345');
    expect(await screen.findByText('This load has already gone')).toBeInTheDocument();
    unmount();

    at('/l/not-a-code');
    expect(await screen.findByText('We could not find that load')).toBeInTheDocument();
    expect(sharedLoad).toHaveBeenCalledTimes(1);
  });
});
