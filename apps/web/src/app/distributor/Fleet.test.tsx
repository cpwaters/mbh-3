import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
import type { Vehicle } from '@mbh/domain';
import Fleet from './Fleet';
import { AppProvider } from '../context';
import { makeMockApp } from '../stories/mock';

const vehiclesForTenant = vi.fn();
vi.mock('../../lib/reader', () => ({
  getReader: () => ({ vehiclesForTenant: (...args: unknown[]) => vehiclesForTenant(...args) }),
}));

function vehicle(overrides: Partial<Vehicle> = {}): Vehicle {
  return {
    vehicleId: 'veh-1',
    tenantId: 'carrier-sb',
    registration: 'AB12 CDE',
    make: 'Volvo',
    model: 'FH16',
    year: 2020,
    trailerNumber: '',
    vin: '',
    vehicleType: 'rigid',
    vehicleConfiguration: 'box',
    status: 'active',
    createdAt: '2026-08-13T09:00:00.000Z',
    createdBy: 'ship-owner',
    ...overrides,
  };
}

// Stands in for the real form: proves both that Fleet navigated there and
// what return path it handed over.
function AddVehicleStub() {
  const state = useLocation().state as { from?: string } | null;
  return (
    <div>
      <h1>Add Vehicle</h1>
      <span data-testid="from">{state?.from ?? ''}</span>
    </div>
  );
}

function renderFleet() {
  return render(
    <AppProvider value={makeMockApp({ isShipper: true, isCarrier: false })}>
      <MemoryRouter initialEntries={['/vehicles']}>
        <Routes>
          <Route path="/vehicles" element={<Fleet />} />
          <Route path="/vehicles/add" element={<AddVehicleStub />} />
        </Routes>
      </MemoryRouter>
    </AppProvider>
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
  vehiclesForTenant.mockReset();
});

describe("Fleet — a shipper's own vehicles", () => {
  it('lists a vehicle with its plate and configuration', async () => {
    vehiclesForTenant.mockResolvedValue([vehicle()]);
    renderFleet();

    await waitFor(() => expect(screen.getByText('Volvo FH16')).toBeInTheDocument());
    expect(screen.getByText('AB12 CDE')).toBeInTheDocument();
    expect(screen.getByText('Box')).toBeInTheDocument();
    expect(screen.getByText('Rigid')).toBeInTheDocument();
  });

  it('heads a trailer with its number, since it has no make or plate', async () => {
    vehiclesForTenant.mockResolvedValue([
      vehicle({
        vehicleType: 'trailer',
        registration: '',
        make: '',
        model: '',
        year: 0,
        trailerNumber: 'TR-114',
        vehicleConfiguration: 'curtain sider',
      }),
    ]);
    renderFleet();

    await waitFor(() => expect(screen.getByRole('heading', { name: 'TR-114' })).toBeInTheDocument());
    expect(screen.getByText('Trailer number:')).toBeInTheDocument();
    // Nothing a trailer does not carry is offered as an empty row.
    expect(screen.queryByText('Registration:')).not.toBeInTheDocument();
    expect(screen.queryByText('Year:')).not.toBeInTheDocument();
  });

  it('invites a first vehicle when the fleet is empty', async () => {
    vehiclesForTenant.mockResolvedValue([]);
    renderFleet();

    await waitFor(() => expect(screen.getByText('No vehicles yet')).toBeInTheDocument());
  });

  it('goes to the add form', async () => {
    vehiclesForTenant.mockResolvedValue([]);
    const user = userEvent.setup();
    renderFleet();

    await waitFor(() => expect(screen.getByRole('button', { name: /add vehicle/i })).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: /add vehicle/i }));

    expect(screen.getByRole('heading', { name: 'Add Vehicle' })).toBeInTheDocument();
    // It is told where to come back to, so saving does not dump a shipper on
    // the carrier's Profile-based fleet.
    expect(screen.getByTestId('from')).toHaveTextContent('/vehicles');
  });

  it('retires a vehicle against the shipper tenant, rather than deleting it', async () => {
    vehiclesForTenant.mockResolvedValue([vehicle()]);
    const fetchMock = vi.fn().mockResolvedValue({ json: async () => ({ ok: true, result: { vehicleId: 'veh-1' } }) });
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    renderFleet();

    await waitFor(() => expect(screen.getByRole('button', { name: 'Remove' })).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: 'Remove' }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const body = JSON.parse(fetchMock.mock.calls[0]?.[1]?.body as string) as {
      type: string;
      payload: Record<string, string>;
    };
    expect(body.type).toBe('retireVehicle');
    expect(body.payload).toMatchObject({ carrierTenantId: 'carrier-sb', vehicleId: 'veh-1' });
  });
});
