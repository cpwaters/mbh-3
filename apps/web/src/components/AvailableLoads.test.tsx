import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Listing } from '@mbh/domain';
import { AvailableLoads } from './AvailableLoads';

// Geocoding hits a real network API (postcodes.io) — stub it so the test is
// hermetic and doesn't depend on outbound network.
vi.mock('../lib/geocode', () => ({
  geocodePostcode: vi.fn().mockResolvedValue(null),
  lookupPostcode: vi.fn().mockResolvedValue(null),
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

  it('flags a dangerous-goods load with an ADR pill, and only that one', () => {
    render(
      <AvailableLoads
        carrierTenantId="carrier-1"
        listings={[listing, { ...listing, loadId: 'load-adr', adrRequired: true }]}
        getIdToken={async () => 'token'}
        onAccepted={() => {}}
        onChanged={() => {}}
        hasActiveJob={false}
      />
    );
    const pills = screen.getAllByText('ADR');
    expect(pills).toHaveLength(1);
    expect(pills[0]?.closest('[title]')).toHaveAttribute('title', expect.stringMatching(/ADR-certified driver/));
  });

  describe('ADR loads and the driver’s certificate', () => {
    const adrLoad: Listing = { ...listing, loadId: 'load-adr', adrRequired: true };

    function renderWithAdr(adr: Parameters<typeof AvailableLoads>[0]['adr'], onOpenProfile = vi.fn()) {
      render(
        <AvailableLoads
          carrierTenantId="carrier-1"
          listings={[listing, adrLoad]}
          getIdToken={async () => 'token'}
          onAccepted={() => {}}
          onChanged={() => {}}
          hasActiveJob={false}
          adr={adr}
          onOpenProfile={onOpenProfile}
        />
      );
      return onOpenProfile;
    }

    it('without a certificate, the ADR load says why and cannot be accepted; the ordinary one can', async () => {
      const onOpenProfile = renderWithAdr({ status: 'none', certificate: null });
      expect(screen.getByText(/Add your ADR certificate to your profile/)).toBeInTheDocument();
      const accepts = screen.getAllByRole('button', { name: 'Accept Load' });
      expect(accepts).toHaveLength(2);
      expect(accepts[0]).toBeEnabled();
      expect(accepts[1]).toBeDisabled();

      await userEvent.setup().click(screen.getByRole('button', { name: 'Add ADR certificate' }));
      expect(onOpenProfile).toHaveBeenCalled();
    });

    it('an expired certificate says when it ran out', () => {
      renderWithAdr({ status: 'expired', certificate: { number: 'ADR-1', expiresOn: '2026-07-31' } });
      expect(screen.getByText(/expired on 31 July 2026/)).toBeInTheDocument();
      expect(screen.getAllByRole('button', { name: 'Accept Load' })[1]).toBeDisabled();
    });

    it('a valid certificate, or one not loaded yet, blocks nothing', () => {
      renderWithAdr({ status: 'valid', certificate: { number: 'ADR-1', expiresOn: '2030-01-01' } });
      expect(screen.queryByText(/ADR certificate to your profile/)).not.toBeInTheDocument();
      for (const b of screen.getAllByRole('button', { name: 'Accept Load' })) expect(b).toBeEnabled();
    });
  });

  it('shows the vehicle size and type in a load’s details, and leaves them out for an older listing that never said', async () => {
    const user = userEvent.setup();
    render(
      <AvailableLoads
        carrierTenantId="carrier-1"
        listings={[{ ...listing, vehicleSizes: ['rigid', 'artic'], vehicleTypes: ['tanker'] }]}
        getIdToken={async () => 'token'}
        onAccepted={() => {}}
        onChanged={() => {}}
        hasActiveJob={false}
      />
    );
    await user.click(screen.getByRole('button', { name: 'View Details' }));
    expect(screen.getByText('Vehicle size')).toBeInTheDocument();
    // In the load's details grid, beside the size.
    const details = screen.getByText('Rigid, Artic').closest('.grid');
    expect(details).toHaveTextContent('Vehicle type');
    expect(details).toHaveTextContent('Tanker');
  });

  it('shows no vehicle rows for a listing made before they were carried', async () => {
    const user = userEvent.setup();
    renderLoads();
    await user.click(screen.getByRole('button', { name: 'View Details' }));
    expect(screen.queryByText('Vehicle size')).not.toBeInTheDocument();
  });

  describe('filtering by vehicle type', () => {
    const fridge: Listing = { ...listing, loadId: 'fridge', origin: { town: 'Preston', postcode: 'PR1 2AB' }, vehicleTypes: ['refrigerated'] };
    const tanker: Listing = { ...listing, loadId: 'tanker', origin: { town: 'Leeds', postcode: 'LS1 4AP' }, vehicleTypes: ['tanker'] };
    const anyVehicle: Listing = { ...listing, loadId: 'any', origin: { town: 'Bolton', postcode: 'BL1 1AA' }, vehicleTypes: [] };

    function renderBoard() {
      render(
        <AvailableLoads
          carrierTenantId="carrier-1"
          listings={[fridge, tanker, anyVehicle]}
          getIdToken={async () => 'token'}
          onAccepted={() => {}}
          onChanged={() => {}}
          hasActiveJob={false}
        />
      );
    }

    afterEach(() => {
      window.localStorage.clear();
    });

    it('shows the loads that take the types picked, plus any that take any vehicle, and remembers the choice', async () => {
      const user = userEvent.setup();
      renderBoard();
      expect(screen.getAllByText(/^(Preston|Leeds|Bolton), /)).toHaveLength(3);

      await user.click(screen.getByRole('button', { name: 'Refrigerated' }));
      expect(screen.getByRole('button', { name: 'Refrigerated' })).toHaveAttribute('aria-pressed', 'true');
      const towns = screen.getAllByText(/^(Preston|Leeds|Bolton), /).map((el) => el.textContent?.split(',')[0]);
      expect(towns.sort()).toEqual(['Bolton', 'Preston']);
      expect(screen.getByText(/Showing 2 of 3 loads/)).toBeInTheDocument();
      expect(window.localStorage.getItem('mbh.vehicleTypeFilter')).toBe('["refrigerated"]');

      await user.click(screen.getByRole('button', { name: 'Clear' }));
      expect(screen.getAllByText(/^(Preston|Leeds|Bolton), /)).toHaveLength(3);
    });

    it('filters by size too, and a load must suit both the size and the type picked', async () => {
      const user = userEvent.setup();
      render(
        <AvailableLoads
          carrierTenantId="carrier-1"
          listings={[
            { ...fridge, vehicleSizes: ['artic'] },
            { ...tanker, vehicleSizes: ['rigid'] },
            { ...anyVehicle, vehicleSizes: [] },
          ]}
          getIdToken={async () => 'token'}
          onAccepted={() => {}}
          onChanged={() => {}}
          hasActiveJob={false}
        />
      );
      const towns = () => screen.getAllByText(/^(Preston|Leeds|Bolton), /).map((el) => el.textContent?.split(',')[0]).sort();

      await user.click(screen.getByRole('button', { name: 'Rigid' }));
      expect(towns()).toEqual(['Bolton', 'Leeds']);
      expect(window.localStorage.getItem('mbh.vehicleSizeFilter')).toBe('["rigid"]');

      // Rigid AND refrigerated: the rigid load is a tanker, so only the
      // any-vehicle load is left.
      await user.click(screen.getByRole('button', { name: 'Refrigerated' }));
      expect(towns()).toEqual(['Bolton']);
      expect(screen.getByText(/for a rigid with a refrigerated body/)).toBeInTheDocument();
    });

    it('says when nothing on the board takes the types picked, and offers everything back', async () => {
      const user = userEvent.setup();
      render(
        <AvailableLoads
          carrierTenantId="carrier-1"
          listings={[tanker]}
          getIdToken={async () => 'token'}
          onAccepted={() => {}}
          onChanged={() => {}}
          hasActiveJob={false}
        />
      );
      await user.click(screen.getByRole('button', { name: 'Box' }));
      expect(screen.getByText('No loads for that vehicle')).toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: 'Show all loads' }));
      expect(screen.getByText(/^Leeds, /)).toBeInTheDocument();
    });
  });
});

