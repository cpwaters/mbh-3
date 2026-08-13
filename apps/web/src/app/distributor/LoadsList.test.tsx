import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
import type { ShipperLoad } from '@mbh/provider-interfaces';
import LoadsList from './LoadsList';
import { AppProvider } from '../context';
import { makeMockApp } from '../stories/mock';

const loadsForShipper = vi.fn();
vi.mock('../../lib/reader', () => ({
  getReader: () => ({ loadsForShipper: (...args: unknown[]) => loadsForShipper(...args) }),
}));

const fulfilledLoad: ShipperLoad = {
  loadId: 'load-1',
  origin: 'Trafford, M17 1WS',
  destination: 'Leith, EH6 6JJ',
  originAddress: { line1: '10 Distribution Way', town: 'Trafford', postcode: 'M17 1WS' },
  destinationAddress: { line1: '5 Harbour Road', town: 'Leith', postcode: 'EH6 6JJ' },
  sourceCompanyName: 'Tesco Distribution',
  destinationCompanyName: 'Asda Leith',
  sourceContact: { name: 'John Smith', email: 'john@tesco.test', phone: '020 1234 5678' },
  destinationContact: { name: 'Sarah Johnson', email: 'sarah@asda.test', phone: '0161 234 5678' },
  distanceMiles: 208,
  weightKg: 14200,
  palletCount: 16,
  priceGbpPence: 68000,
  pickupBy: '2026-08-02',
  pickupTime: '09:00',
  deliverBy: '2026-08-03',
  deliveryTime: '17:00',
  status: 'fulfilled',
  needsClosureBackfill: false,
};

// Stands in for CreateLoad at /create — just surfaces the router state it
// was navigated with, so the test can assert on it without rendering the
// entire (unrelated) Create Load form.
function LocationProbe() {
  const location = useLocation();
  return <div data-testid="probe">{JSON.stringify(location.state)}</div>;
}

function renderLoadsList(state?: { flash?: string; warning?: string | null }) {
  return render(
    <AppProvider value={makeMockApp({ isShipper: true, isCarrier: false })}>
      <MemoryRouter initialEntries={[{ pathname: '/', state }]}>
        <Routes>
          <Route path="/" element={<LoadsList />} />
          <Route path="/create" element={<LocationProbe />} />
        </Routes>
      </MemoryRouter>
    </AppProvider>
  );
}

describe('LoadsList — confirming a load Create Load just posted', () => {
  it('shows the confirmation it was navigated with', async () => {
    loadsForShipper.mockResolvedValue([fulfilledLoad]);
    renderLoadsList({ flash: 'Load posted.', warning: null });

    await waitFor(() => expect(screen.getByText('Load posted.')).toBeInTheDocument());
  });

  it('shows the address-book warning alongside it, since the load still posted', async () => {
    loadsForShipper.mockResolvedValue([fulfilledLoad]);
    renderLoadsList({ flash: 'Load posted.', warning: 'The load posted, but the collection address could not be saved.' });

    await waitFor(() =>
      expect(screen.getByText('The load posted, but the collection address could not be saved.')).toBeInTheDocument()
    );
    expect(screen.getByText('Load posted.')).toBeInTheDocument();
  });

  it('says nothing when the shipper simply opened the loads screen', async () => {
    loadsForShipper.mockResolvedValue([fulfilledLoad]);
    renderLoadsList();

    await waitFor(() => expect(screen.getByText('All Loads')).toBeInTheDocument());
    expect(screen.queryByText('Load posted.')).not.toBeInTheDocument();
  });
});

describe('LoadsList — reuse a fulfilled load', () => {
  it('shows a Reuse button only for a fulfilled load, and navigates to Create Load with its addresses', async () => {
    loadsForShipper.mockResolvedValue([fulfilledLoad]);
    const user = userEvent.setup();
    renderLoadsList();

    await waitFor(() => expect(screen.getByRole('button', { name: /reuse this load/i })).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: /reuse this load/i }));

    await waitFor(() => expect(screen.getByTestId('probe')).toBeInTheDocument());
    const state = JSON.parse(screen.getByTestId('probe').textContent ?? '{}') as {
      reuseFrom: Record<string, string>;
    };
    expect(state.reuseFrom).toMatchObject({
      source_company_name: 'Tesco Distribution',
      source_street: '10 Distribution Way',
      source_town: 'Trafford',
      source_city: 'Trafford',
      source_postcode: 'M17 1WS',
      source_contact_name: 'John Smith',
      source_contact_email: 'john@tesco.test',
      source_contact_phone: '020 1234 5678',
      destination_company_name: 'Asda Leith',
      destination_street: '5 Harbour Road',
      destination_town: 'Leith',
      destination_city: 'Leith',
      destination_postcode: 'EH6 6JJ',
      destination_contact_name: 'Sarah Johnson',
      destination_contact_email: 'sarah@asda.test',
      destination_contact_phone: '0161 234 5678',
    });
  });

  it('does not show Reuse for a matched (in-progress) load', async () => {
    loadsForShipper.mockResolvedValue([{ ...fulfilledLoad, status: 'matched' as const }]);
    renderLoadsList();

    await waitFor(() => expect(screen.getByText('Trafford, M17 1WS')).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: /reuse this load/i })).not.toBeInTheDocument();
  });

  it('does not show Reuse for a cancelled load', async () => {
    loadsForShipper.mockResolvedValue([{ ...fulfilledLoad, status: 'cancelled' as const }]);
    renderLoadsList();

    await waitFor(() => expect(screen.getByText('Trafford, M17 1WS')).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: /reuse this load/i })).not.toBeInTheDocument();
  });
});

describe('LoadsList — mark a stuck matched load as fulfilled', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('shows "Mark as fulfilled" only when needsClosureBackfill is true, and dispatches backfillCloseJobs scoped to just this load', async () => {
    loadsForShipper.mockResolvedValue([{ ...fulfilledLoad, status: 'matched' as const, needsClosureBackfill: true }]);
    const fetchMock = vi.fn().mockResolvedValue({ json: async () => ({ ok: true, result: { jobIds: ['job-1'] } }) });
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    renderLoadsList();

    await waitFor(() => expect(screen.getByRole('button', { name: /mark as fulfilled/i })).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: /mark as fulfilled/i }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/dispatch',
        expect.objectContaining({ body: expect.stringContaining('"type":"backfillCloseJobs"') })
      )
    );
    const body = JSON.parse(fetchMock.mock.calls[0]?.[1]?.body as string) as {
      payload: { tenantId: string; loadId: string };
    };
    expect(body.payload).toEqual({ tenantId: 'carrier-sb', loadId: 'load-1' });
  });

  it('does not show the button for a matched load that does not need it', async () => {
    loadsForShipper.mockResolvedValue([{ ...fulfilledLoad, status: 'matched' as const, needsClosureBackfill: false }]);
    renderLoadsList();

    await waitFor(() => expect(screen.getByText('Trafford, M17 1WS')).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: /mark as fulfilled/i })).not.toBeInTheDocument();
  });

  it('does not show the button for an already-fulfilled load, even if the flag were somehow still true', async () => {
    loadsForShipper.mockResolvedValue([{ ...fulfilledLoad, status: 'fulfilled' as const, needsClosureBackfill: true }]);
    renderLoadsList();

    await waitFor(() => expect(screen.getByText('Trafford, M17 1WS')).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: /mark as fulfilled/i })).not.toBeInTheDocument();
  });
});
