import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import CreateLoad from './CreateLoad';
import { AppProvider } from '../context';
import { makeMockApp } from '../stories/mock';

const addressBookForTenant = vi.fn().mockResolvedValue([]);
vi.mock('../../lib/reader', () => ({
  getReader: () => ({ addressBookForTenant: (...args: unknown[]) => addressBookForTenant(...args) }),
}));

function renderCreateLoad(reuseFrom?: Record<string, string>) {
  return render(
    <AppProvider value={makeMockApp({ isShipper: true, isCarrier: false })}>
      <MemoryRouter initialEntries={[{ pathname: '/create', state: reuseFrom ? { reuseFrom } : undefined }]}>
        <Routes>
          <Route path="/create" element={<CreateLoad />} />
        </Routes>
      </MemoryRouter>
    </AppProvider>
  );
}

const byId = (id: string) => document.getElementById(id) as HTMLInputElement;

describe('CreateLoad — reused addresses', () => {
  it('prefills the address fields from router state, leaving weight/pallets/dates blank for a fresh entry', () => {
    renderCreateLoad({
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

    expect(screen.getByText(/addresses carried over from a previous load/i)).toBeInTheDocument();

    expect(byId('source_company_name')).toHaveValue('Tesco Distribution');
    expect(byId('source_street')).toHaveValue('10 Distribution Way');
    expect(byId('source_city')).toHaveValue('Trafford');
    expect(byId('source_postcode')).toHaveValue('M17 1WS');
    expect(byId('source_contact_email')).toHaveValue('john@tesco.test');
    expect(byId('destination_company_name')).toHaveValue('Asda Leith');
    expect(byId('destination_postcode')).toHaveValue('EH6 6JJ');

    // Explicitly left for the shipper to fill in fresh.
    expect(byId('weight_kg')).toHaveValue(null);
    expect(byId('pallet_count')).toHaveValue(null);
    expect(byId('pickup_date')).toHaveValue('');
    expect(byId('pickup_time')).toHaveValue('');
    expect(byId('delivery_date')).toHaveValue('');
    expect(byId('delivery_time')).toHaveValue('');
  });

  it('renders a normal blank form (no reuse banner) when navigated to directly', () => {
    renderCreateLoad();

    expect(screen.queryByText(/addresses carried over/i)).not.toBeInTheDocument();
    expect(byId('source_company_name')).toHaveValue('');
  });
});

describe('CreateLoad — address book picker', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    addressBookForTenant.mockResolvedValue([]);
  });

  const saved = {
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
    status: 'active' as const,
    createdAt: '2026-08-13T09:00:00.000Z',
    createdBy: 'ship-owner',
    updatedAt: '2026-08-13T09:00:00.000Z',
  };

  it('fills the whole collection block from a picked saved address', async () => {
    addressBookForTenant.mockResolvedValue([saved]);
    const user = userEvent.setup();
    renderCreateLoad();

    const picker = await screen.findByLabelText(/saved collection addresses/i);
    await user.selectOptions(picker, 'addr-1');

    expect(byId('source_company_name')).toHaveValue('Tesco Distribution');
    expect(byId('source_street')).toHaveValue('10 Distribution Way');
    expect(byId('source_city')).toHaveValue('Trafford');
    expect(byId('source_postcode')).toHaveValue('M17 1WS');
    expect(byId('source_contact_email')).toHaveValue('john@tesco.test');
    // The delivery block is untouched — picking one side never fills the other.
    expect(byId('destination_street')).toHaveValue('');
  });

  it('offers no dropdown until something is saved, but still offers to save', async () => {
    addressBookForTenant.mockResolvedValue([]);
    renderCreateLoad();

    await waitFor(() => expect(screen.queryAllByText(/no saved addresses yet/i).length).toBeGreaterThan(0));
    expect(screen.queryByLabelText(/saved collection addresses/i)).not.toBeInTheDocument();
  });

  it('only enables "save to address book" once the address is worth saving', async () => {
    addressBookForTenant.mockResolvedValue([]);
    const user = userEvent.setup();
    renderCreateLoad();

    const ticks = await screen.findAllByLabelText(/save to address book/i);
    expect(ticks[0]).toBeDisabled();

    await user.type(byId('source_street'), '10 Distribution Way');
    await user.type(byId('source_city'), 'Trafford');
    await user.type(byId('source_postcode'), 'M17 1WS');

    await waitFor(() => expect(screen.getAllByLabelText(/save to address book/i)[0]).toBeEnabled());
  });
});
