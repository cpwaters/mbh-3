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

describe('AvailableLoads — "Enable location" vs. a watch already open', () => {
  it('offers "Enable location" when nothing has been requested yet', () => {
    render(
      <AvailableLoads
        carrierTenantId="carrier-1"
        listings={[listing]}
        getIdToken={async () => 'token'}
        onAccepted={vi.fn()}
        onChanged={vi.fn()}
        hasActiveJob={false}
        onEnableLocation={vi.fn()}
      />
    );

    expect(screen.getByRole('button', { name: 'Enable location' })).toBeInTheDocument();
  });

  // Regression: a returning user whose permission was already granted gets a
  // watch opened silently on mount (see useDeviceLocation's auto-resume
  // effect). Before a fix lands, `tracking` is still false — if the banner
  // only checked that, it would keep offering "Enable location", and
  // clicking it would silently do nothing (the watch is already open). The
  // watchingLocation flag must swap it for an honest waiting state instead.
  it('shows a waiting state instead of a dead "Enable location" button once a watch is already open', () => {
    render(
      <AvailableLoads
        carrierTenantId="carrier-1"
        listings={[listing]}
        getIdToken={async () => 'token'}
        onAccepted={vi.fn()}
        onChanged={vi.fn()}
        hasActiveJob={false}
        onEnableLocation={vi.fn()}
        watchingLocation={true}
      />
    );

    expect(screen.queryByRole('button', { name: 'Enable location' })).not.toBeInTheDocument();
    expect(screen.getByText(/Waiting for a GPS signal/)).toBeInTheDocument();
  });

  it('prefers the location error message over the waiting state once one arrives', () => {
    render(
      <AvailableLoads
        carrierTenantId="carrier-1"
        listings={[listing]}
        getIdToken={async () => 'token'}
        onAccepted={vi.fn()}
        onChanged={vi.fn()}
        hasActiveJob={false}
        onEnableLocation={vi.fn()}
        watchingLocation={true}
        locationError="Could not get your location. Check location permissions and try again."
      />
    );

    expect(screen.queryByText(/Waiting for a GPS signal/)).not.toBeInTheDocument();
    expect(screen.getByText(/Could not get your location/)).toBeInTheDocument();
  });
});
