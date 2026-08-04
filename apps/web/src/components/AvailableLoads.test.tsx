import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Listing } from '@mbh/domain';
import { AvailableLoads } from './AvailableLoads';

// Geocoding hits a real network API (postcodes.io) — stub it so the test is
// hermetic and doesn't depend on outbound network.
vi.mock('../lib/geocode', () => ({
  geocodePostcode: vi.fn().mockResolvedValue(null),
}));

const listing: Listing = {
  loadId: 'load-1',
  shipperTenantId: 'shipper-1',
  origin: { town: 'Avonmouth', postcode: 'BS11 8DL' },
  destination: { town: 'Cardiff', postcode: 'CF10 4UW' },
  description: 'Steel coils',
  weightKg: 20000,
  palletCount: 8,
  priceGbpPence: 42000,
  pickupBy: '2026-08-04',
  deliverBy: '2026-08-05',
  postedAt: '2026-08-01T00:00:00.000Z',
};

function renderLoads() {
  return render(
    <AvailableLoads
      carrierTenantId="carrier-1"
      listings={[listing]}
      getIdToken={async () => 'token'}
      onAccepted={vi.fn()}
      onChanged={vi.fn()}
      hasActiveJob={false}
    />
  );
}

describe('AvailableLoads — View Details toggle', () => {
  it('is collapsed by default, and shows the consignment details once expanded', async () => {
    const user = userEvent.setup();
    renderLoads();

    expect(screen.queryByText('Weight')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'View Details' }));

    expect(screen.getByText('Weight')).toBeInTheDocument();
    expect(screen.getByText('20,000 kg')).toBeInTheDocument();
    expect(screen.getByText('Pallets')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Hide Details' })).toBeInTheDocument();
  });

  it('"Hide Details" collapses it again', async () => {
    const user = userEvent.setup();
    renderLoads();

    await user.click(screen.getByRole('button', { name: 'View Details' }));
    expect(screen.getByText('Weight')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Hide Details' }));
    expect(screen.queryByText('Weight')).not.toBeInTheDocument();
  });
});
