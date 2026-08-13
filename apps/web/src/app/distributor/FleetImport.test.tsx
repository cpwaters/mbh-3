import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
import FleetImport from './FleetImport';
import { AppProvider } from '../context';
import { makeMockApp } from '../stories/mock';

// Stands in for the Fleet screen, so a test can see what the importer
// navigated back with.
function FleetStub() {
  const state = useLocation().state as { flash?: string } | null;
  return (
    <div>
      <h1>Fleet</h1>
      {state?.flash !== undefined && <p>{state.flash}</p>}
    </div>
  );
}

function renderImport() {
  return render(
    <AppProvider value={makeMockApp({ isShipper: true, isCarrier: false })}>
      <MemoryRouter initialEntries={['/vehicles/import']}>
        <Routes>
          <Route path="/vehicles/import" element={<FleetImport />} />
          <Route path="/vehicles" element={<FleetStub />} />
        </Routes>
      </MemoryRouter>
    </AppProvider>
  );
}

const csvFile = (body: string, name = 'fleet.csv'): File =>
  new File([body], name, { type: 'text/csv' });

const GOOD_CSV = [
  'vehicleType,vehicleConfiguration,registration,trailerNumber,make,model,year',
  'rigid,box,AB12 CDE,,Volvo,FL,2021',
  'trailer,curtain sider,,TR-114,,,',
].join('\n');

afterEach(() => {
  vi.unstubAllGlobals();
});

async function upload(user: ReturnType<typeof userEvent.setup>, file: File): Promise<void> {
  const input = document.getElementById('fleet_file') as HTMLInputElement;
  await user.upload(input, file);
}

describe('FleetImport — reading the sheet', () => {
  it('shows every row and what will happen to it before anything is sent', async () => {
    const user = userEvent.setup();
    renderImport();

    await upload(user, csvFile(GOOD_CSV));

    await waitFor(() => expect(screen.getByText('2 ready to import')).toBeInTheDocument());
    expect(screen.getByText(/AB12 CDE/)).toBeInTheDocument();
    expect(screen.getByText(/TR-114/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Import 2 vehicles' })).toBeEnabled();
  });

  it('names a bad row and its reason, and still offers to import the good ones', async () => {
    const user = userEvent.setup();
    renderImport();

    await upload(
      user,
      csvFile(
        [
          'vehicleType,vehicleConfiguration,registration,trailerNumber,make,model,year',
          'rigid,box,AB12 CDE,,Volvo,FL,2021',
          'trailer,curtain sider,,,,,', // no trailer number
          'spaceship,box,EF56 GHI,,Volvo,FL,2021',
        ].join('\n')
      )
    );

    await waitFor(() => expect(screen.getByText('1 ready to import, 2 to fix')).toBeInTheDocument());
    expect(screen.getByText(/Trailer number is missing/)).toBeInTheDocument();
    expect(screen.getByText(/"spaceship" is not one of/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Import 1 vehicle' })).toBeEnabled();
  });

  it('refuses a sheet whose headings it cannot read, rather than importing nothing quietly', async () => {
    const user = userEvent.setup();
    renderImport();

    await upload(user, csvFile('make,model\nVolvo,FL'));

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/vehicle type/i));
    expect(screen.queryByRole('button', { name: /^Import/ })).not.toBeInTheDocument();
  });

  it('mentions a column it ignored, so a mistyped heading does not pass unnoticed', async () => {
    const user = userEvent.setup();
    renderImport();

    await upload(user, csvFile('vehicleType,trailerNumber,vehicleConfiguration,axles\ntrailer,TR-1,box,3'));

    await waitFor(() => expect(screen.getByText(/Ignored column: axles/)).toBeInTheDocument());
  });
});

describe('FleetImport — sending it', () => {
  it('dispatches one addVehicle per row and returns to the fleet', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ json: async () => ({ ok: true, result: { vehicleId: 'veh-9' } }) });
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    renderImport();

    await upload(user, csvFile(GOOD_CSV));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Import 2 vehicles' })).toBeEnabled());
    await user.click(screen.getByRole('button', { name: 'Import 2 vehicles' }));

    await waitFor(() => expect(screen.getByRole('heading', { name: 'Fleet' })).toBeInTheDocument());
    expect(screen.getByText('2 vehicles imported.')).toBeInTheDocument();

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const bodies = fetchMock.mock.calls.map(
      (call) => JSON.parse(call[1]?.body as string) as { type: string; payload: Record<string, unknown> }
    );
    expect(bodies.every((b) => b.type === 'addVehicle')).toBe(true);
    expect(bodies[0]?.payload).toMatchObject({ carrierTenantId: 'carrier-sb', registration: 'AB12 CDE' });
    expect(bodies[1]?.payload).toMatchObject({ vehicleType: 'trailer', trailerNumber: 'TR-114' });
  });

  it("reports the server's refusals by row instead of claiming a clean import", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ json: async () => ({ ok: true, result: { vehicleId: 'veh-9' } }) })
      .mockResolvedValueOnce({
        json: async () => ({ ok: false, error: { code: 'conflict', message: 'That vehicle is already in your fleet.' } }),
      });
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    renderImport();

    await upload(user, csvFile(GOOD_CSV));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Import 2 vehicles' })).toBeEnabled());
    await user.click(screen.getByRole('button', { name: 'Import 2 vehicles' }));

    await waitFor(() => expect(screen.getByRole('heading', { name: 'Fleet' })).toBeInTheDocument());
    expect(screen.getByText('1 of 2 imported — 1 refused.')).toBeInTheDocument();
  });

  it('stays put with the reasons when the server refuses every row', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        json: async () => ({ ok: false, error: { code: 'forbidden', message: 'Your role does not permit this action.' } }),
      })
    );
    const user = userEvent.setup();
    renderImport();

    await upload(user, csvFile(GOOD_CSV));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Import 2 vehicles' })).toBeEnabled());
    await user.click(screen.getByRole('button', { name: 'Import 2 vehicles' }));

    await waitFor(() => expect(screen.getByText(/The server refused some rows/)).toBeInTheDocument());
    expect(screen.getByText(/Row 2: Your role does not permit this action\./)).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Fleet' })).not.toBeInTheDocument();
  });
});
