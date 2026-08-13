import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import type { AddressBookEntry } from '@mbh/domain';
import AddressBook from './AddressBook';
import { AppProvider } from '../context';
import { makeMockApp } from '../stories/mock';

const addressBookForTenant = vi.fn();
vi.mock('../../lib/reader', () => ({
  getReader: () => ({ addressBookForTenant: (...args: unknown[]) => addressBookForTenant(...args) }),
}));

function entry(overrides: Partial<AddressBookEntry> = {}): AddressBookEntry {
  return {
    entryId: 'addr-1',
    tenantId: 'carrier-sb',
    label: 'Tesco Trafford DC',
    companyName: 'Tesco Distribution',
    line1: '10 Distribution Way',
    town: 'Trafford',
    postcode: 'M17 1WS',
    contactName: 'John Smith',
    contactEmail: 'john@tesco.test',
    contactPhone: '0161 234 5678',
    status: 'active',
    createdAt: '2026-08-13T09:00:00.000Z',
    createdBy: 'ship-owner',
    updatedAt: '2026-08-13T09:00:00.000Z',
    ...overrides,
  };
}

function renderPage() {
  return render(
    <AppProvider value={makeMockApp({ isShipper: true, isCarrier: false })}>
      <MemoryRouter>
        <AddressBook />
      </MemoryRouter>
    </AppProvider>
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
  addressBookForTenant.mockReset();
});

describe('AddressBook — manage saved addresses', () => {
  it('lists saved entries with their address and contact details', async () => {
    addressBookForTenant.mockResolvedValue([entry()]);
    renderPage();

    await waitFor(() => expect(screen.getByText('Tesco Trafford DC')).toBeInTheDocument());
    expect(screen.getByText('10 Distribution Way, Trafford, M17 1WS')).toBeInTheDocument();
    expect(screen.getByText(/john@tesco\.test/)).toBeInTheDocument();
  });

  it('invites a first entry when the book is empty', async () => {
    addressBookForTenant.mockResolvedValue([]);
    renderPage();

    await waitFor(() => expect(screen.getByText('No saved addresses yet')).toBeInTheDocument());
  });

  it('dispatches saveAddressBookEntry when adding a new address', async () => {
    addressBookForTenant.mockResolvedValue([]);
    const fetchMock = vi.fn().mockResolvedValue({ json: async () => ({ ok: true, result: { entryId: 'addr-9' } }) });
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    renderPage();

    await waitFor(() => expect(screen.getByRole('button', { name: /add address/i })).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: /add address/i }));

    await user.type(screen.getByLabelText(/name in your address book/i), 'Asda Leith');
    await user.type(screen.getByLabelText(/^street/i), '5 Harbour Road');
    await user.type(screen.getByLabelText(/town or city/i), 'Leith');
    await user.type(screen.getByLabelText(/postcode/i), 'EH6 6JJ');
    await user.click(screen.getByRole('button', { name: /save address/i }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const body = JSON.parse(fetchMock.mock.calls[0]?.[1]?.body as string) as {
      type: string;
      payload: Record<string, string>;
    };
    expect(body.type).toBe('saveAddressBookEntry');
    expect(body.payload).toMatchObject({
      shipperTenantId: 'carrier-sb',
      label: 'Asda Leith',
      line1: '5 Harbour Road',
      town: 'Leith',
      postcode: 'EH6 6JJ',
    });
  });

  it('dispatches updateAddressBookEntry (not save) when editing an existing one', async () => {
    addressBookForTenant.mockResolvedValue([entry()]);
    const fetchMock = vi.fn().mockResolvedValue({ json: async () => ({ ok: true, result: { entryId: 'addr-1' } }) });
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    renderPage();

    await waitFor(() => expect(screen.getByRole('button', { name: /edit/i })).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: /edit/i }));

    // The form opens prefilled from the entry.
    expect(screen.getByLabelText(/name in your address book/i)).toHaveValue('Tesco Trafford DC');
    await user.click(screen.getByRole('button', { name: /save address/i }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const body = JSON.parse(fetchMock.mock.calls[0]?.[1]?.body as string) as {
      type: string;
      payload: Record<string, string>;
    };
    expect(body.type).toBe('updateAddressBookEntry');
    expect(body.payload).toMatchObject({ entryId: 'addr-1', shipperTenantId: 'carrier-sb' });
  });

  it('archives an entry rather than deleting it', async () => {
    addressBookForTenant.mockResolvedValue([entry()]);
    const fetchMock = vi.fn().mockResolvedValue({ json: async () => ({ ok: true, result: { entryId: 'addr-1' } }) });
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    renderPage();

    await waitFor(() => expect(screen.getByRole('button', { name: /archive/i })).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: /archive/i }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const body = JSON.parse(fetchMock.mock.calls[0]?.[1]?.body as string) as { type: string };
    expect(body.type).toBe('archiveAddressBookEntry');
  });

  it("surfaces the server's refusal instead of pretending the save worked", async () => {
    addressBookForTenant.mockResolvedValue([]);
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        json: async () => ({ ok: false, error: { code: 'forbidden', message: 'Your role does not permit this action.' } }),
      })
    );
    const user = userEvent.setup();
    renderPage();

    await waitFor(() => expect(screen.getByRole('button', { name: /add address/i })).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: /add address/i }));
    await user.type(screen.getByLabelText(/name in your address book/i), 'Nope');
    await user.click(screen.getByRole('button', { name: /save address/i }));

    await waitFor(() =>
      expect(screen.getByText('Your role does not permit this action.')).toBeInTheDocument()
    );
  });
});
