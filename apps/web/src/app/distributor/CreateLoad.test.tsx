import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
import CreateLoad from './CreateLoad';
import { AppProvider } from '../context';
import { makeMockApp } from '../stories/mock';

// Stands in for LoadsList: proves both that Create Load navigated here and
// what confirmation it carried across.
function LoadsScreenStub() {
  const state = useLocation().state as { flash?: string; warning?: string | null } | null;
  return (
    <div>
      <h1>All Loads</h1>
      {state?.flash !== undefined && <p>{state.flash}</p>}
      {state?.warning != null && <p>{state.warning}</p>}
    </div>
  );
}

const addressBookForTenant = vi.fn().mockResolvedValue([]);
vi.mock('../../lib/reader', () => ({
  getReader: () => ({ addressBookForTenant: (...args: unknown[]) => addressBookForTenant(...args) }),
}));

function renderCreateLoad(reuseFrom?: Record<string, string>) {
  return render(
    <AppProvider value={makeMockApp({ isShipper: true, isCarrier: false })}>
      <MemoryRouter initialEntries={[{ pathname: '/create', state: reuseFrom ? { reuseFrom } : undefined }]}>
        <Routes>
          <Route path="/" element={<LoadsScreenStub />} />
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

// Everything the form insists on, so a test can fill it and then take one
// field back out again.
const REQUIRED: Record<string, string> = {
  source_company_name: 'Tesco Distribution',
  source_street: '10 Distribution Way',
  source_city: 'Trafford',
  source_postcode: 'M17 1WS',
  source_contact_name: 'John Smith',
  source_contact_email: 'john@tesco.test',
  destination_company_name: 'Asda Leith',
  destination_street: '5 Harbour Road',
  destination_city: 'Leith',
  destination_postcode: 'EH6 6JJ',
  destination_contact_name: 'Sarah Johnson',
  destination_contact_email: 'sarah@asda.test',
  description: 'Mixed groceries',
  weight_kg: '19000',
  price: '680',
  pickup_date: '2026-08-20',
  pickup_time: '09:00',
  delivery_date: '2026-08-21',
  delivery_time: '16:00',
};

function fillRequired(except: string[] = []): void {
  for (const [id, value] of Object.entries(REQUIRED)) {
    if (except.includes(id)) continue;
    fireEvent.change(byId(id), { target: { value } });
  }
}

describe('CreateLoad — a form that says what is wrong and where', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('lists every missing field at the top and moves to the first one', async () => {
    const user = userEvent.setup();
    renderCreateLoad();

    await user.click(screen.getByRole('button', { name: /create load/i }));

    const summary = screen.getByRole('alert');
    expect(summary).toHaveTextContent(`${Object.keys(REQUIRED).length} fields still need filling in`);
    expect(summary).toHaveTextContent('Collection postcode');
    expect(summary).toHaveTextContent('Delivery contact email');
    expect(summary).toHaveTextContent('Pickup time');
    // The shipper lands on the field, not just a message about it.
    expect(document.activeElement).toBe(byId('source_company_name'));
  });

  it('moves to a field far down the form when that is the only one missing', async () => {
    const user = userEvent.setup();
    renderCreateLoad();
    fillRequired(['delivery_time']);

    await user.click(screen.getByRole('button', { name: /create load/i }));

    expect(screen.getByRole('alert')).toHaveTextContent('One field still needs filling in');
    expect(document.activeElement).toBe(byId('delivery_time'));
  });

  it('jumps to a field when its entry in the summary is clicked', async () => {
    const user = userEvent.setup();
    renderCreateLoad();
    fillRequired(['source_postcode', 'price']);

    await user.click(screen.getByRole('button', { name: /create load/i }));
    await user.click(screen.getByRole('button', { name: 'Payment (£)' }));

    expect(document.activeElement).toBe(byId('price'));
  });

  it('drops a field from the summary as soon as it is filled in', async () => {
    const user = userEvent.setup();
    renderCreateLoad();
    fillRequired(['description']);

    await user.click(screen.getByRole('button', { name: /create load/i }));
    expect(screen.getByRole('alert')).toHaveTextContent('Description');

    fireEvent.change(byId('description'), { target: { value: 'Mixed groceries' } });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});

describe('CreateLoad — closing the form once the load is posted', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns to the loads screen with a confirmation', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ json: async () => ({ ok: true, result: { loadId: 'load-9' } }) });
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    renderCreateLoad();
    fillRequired();

    await user.click(screen.getByRole('button', { name: /create load/i }));

    await waitFor(() => expect(screen.getByRole('heading', { name: 'All Loads' })).toBeInTheDocument());
    expect(screen.getByText('Load posted.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /create load/i })).not.toBeInTheDocument();
    expect(JSON.parse(fetchMock.mock.calls[0]?.[1]?.body as string)).toMatchObject({ type: 'postLoad' });
  });

  it('stays on the form when the server refuses the load', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        json: async () => ({ ok: false, error: { code: 'forbidden', message: 'Your role does not permit this action.' } }),
      })
    );
    const user = userEvent.setup();
    renderCreateLoad();
    fillRequired();

    await user.click(screen.getByRole('button', { name: /create load/i }));

    await waitFor(() => expect(screen.getByText('Your role does not permit this action.')).toBeInTheDocument());
    expect(screen.queryByRole('heading', { name: 'All Loads' })).not.toBeInTheDocument();
    // Nothing typed is lost when the post is refused.
    expect(byId('source_company_name')).toHaveValue('Tesco Distribution');
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
