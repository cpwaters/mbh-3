import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { FOUNDER_EMAIL, type Job, type Load, type Member, type Tenant } from '@mbh/domain';
import type { AdminActivity, AdminPerson } from '@mbh/provider-interfaces';
import { AdminLayout } from './AdminLayout';
import { AdminCompanies } from './AdminCompanies';
import { AdminCompany } from './AdminCompany';
import { AdminPeople } from './AdminPeople';
import { AdminLoads } from './AdminLoads';
import { AdminActivity as ActivityPage } from './AdminActivity';
import { AdminBilling } from './AdminBilling';
import { marketplaceStats } from './AdminHome';
import { AppProvider } from '../context';
import { makeMockApp } from '../stories/mock';

const address = (town: string) => ({ line1: '1 Yard Lane', town, postcode: 'M1 1AA' });

const companies: Tenant[] = [
  { tenantId: 'acme', name: 'Acme Foods', capabilities: ['shipper'], createdAt: '2026-09-01T09:00:00.000Z' },
  { tenantId: 'waters', name: 'Waters Haulage', capabilities: ['carrier'], createdAt: '2026-09-02T09:00:00.000Z' },
  {
    tenantId: 'shady',
    name: 'Shady Logistics',
    capabilities: ['carrier'],
    createdAt: '2026-09-03T09:00:00.000Z',
    status: 'suspended',
    suspendedReason: 'Insurance lapsed',
    suspendedAt: '2026-10-01T09:00:00.000Z',
  },
];

const members: Member[] = [
  { tenantId: 'acme', actorId: 'ann', displayName: 'Ann', role: 'owner', status: 'active', createdAt: '2026-09-01T09:00:00.000Z' },
  { tenantId: 'waters', actorId: 'chris', displayName: 'Chris', role: 'driver', status: 'active', createdAt: '2026-09-02T09:00:00.000Z' },
];

const people: AdminPerson[] = [
  { actorId: 'ann', displayName: 'Ann Acme', email: 'ann@acme.test', phone: '' },
  { actorId: 'chris', displayName: 'Chris Waters', email: 'chris@waters.test', phone: '07700 900123' },
];

const load = (loadId: string, status: Load['status']): Load => ({
  loadId,
  tenantId: 'acme',
  status,
  origin: address('Trafford'),
  destination: address('Leith'),
  consignment: { description: 'Pallets', weightKg: 12000, palletCount: 14 },
  priceGbpPence: 68_000,
  pickupBy: '2026-10-30',
  deliverBy: '2026-10-31',
  createdAt: '2026-10-20T09:00:00.000Z',
});

const loads: Load[] = [load('load-open', 'available'), load('load-taken', 'matched')];

const jobs: Job[] = [
  {
    jobId: 'job-1',
    loadId: 'load-taken',
    shipperTenantId: 'acme',
    carrierTenantId: 'waters',
    driverActorId: 'chris',
    status: 'in_transit',
    createdAt: '2026-10-21T09:00:00.000Z',
    origin: address('Trafford'),
    destination: address('Leith'),
    priceGbpPence: 68_000,
  },
];

const activity: AdminActivity[] = [
  { auditId: 'a-2', action: 'recordRoutePoint', actorId: 'chris', at: '2026-10-21T10:05:00.000Z', source: 'member', detail: {} },
  {
    auditId: 'a-1',
    action: 'suspendCompany',
    actorId: 'founder',
    at: '2026-10-01T09:00:00.000Z',
    source: 'member',
    detail: { tenantId: 'shady', companyName: 'Shady Logistics', reason: 'Insurance lapsed' },
  },
];

vi.mock('../../lib/reader', () => ({
  getReader: () => ({
    adminCompanies: async () => companies,
    adminMembers: async () => members,
    adminPeople: async () => people,
    adminLoads: async () => loads,
    adminJobs: async () => jobs,
    adminActivity: async () => activity,
    billingConfig: async () => ({ enforced: false, paymentLinks: {}, portalUrl: '', monthlyPricePence: {} }),
  }),
}));

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn().mockResolvedValue({ json: async () => ({ ok: true, result: {} }) });
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function dispatched(): { type: string; payload: Record<string, unknown> }[] {
  return fetchMock.mock.calls.map((call) => JSON.parse((call[1] as { body: string }).body));
}

function renderAt(path: string) {
  const base = makeMockApp();
  const app = { ...base, auth: { ...base.auth, session: { actorId: 'founder', email: FOUNDER_EMAIL, displayName: 'Founder' } } };
  return render(
    <AppProvider value={app}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/admin" element={<AdminLayout />}>
            <Route path="companies" element={<AdminCompanies />} />
            <Route path="companies/:tenantId" element={<AdminCompany />} />
            <Route path="people" element={<AdminPeople />} />
            <Route path="loads" element={<AdminLoads />} />
            <Route path="activity" element={<ActivityPage />} />
            <Route path="billing" element={<AdminBilling />} />
          </Route>
        </Routes>
      </MemoryRouter>
    </AppProvider>
  );
}

describe('Companies', () => {
  it('lists every company with what it has done, and filters to the suspended ones', async () => {
    const user = userEvent.setup();
    renderAt('/admin/companies');
    expect(await screen.findByText('Acme Foods')).toBeInTheDocument();
    expect(screen.getByText('Waters Haulage')).toBeInTheDocument();
    expect(screen.getByText(/2 loads posted/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Suspended' }));
    expect(screen.getByText('Shady Logistics')).toBeInTheDocument();
    expect(screen.queryByText('Acme Foods')).not.toBeInTheDocument();
  });
});

describe('A company', () => {
  it('will not suspend without a reason, and warns when jobs are under way', async () => {
    const user = userEvent.setup();
    renderAt('/admin/companies/waters');
    await user.click(await screen.findByRole('button', { name: /suspend company/i }));

    // The carrier has a job on the road — the founder is told before, not after.
    expect(screen.getByText(/1 job is under way/)).toBeInTheDocument();
    const confirm = screen.getByRole('button', { name: 'Suspend' });
    expect(confirm).toBeDisabled();

    await user.type(screen.getByPlaceholderText(/insurance certificate/i), 'Unpaid invoices');
    await user.click(confirm);
    await waitFor(() => expect(dispatched()).toHaveLength(1));
    expect(dispatched()[0]).toMatchObject({
      type: 'suspendCompany',
      payload: { tenantId: 'waters', reason: 'Unpaid invoices' },
    });
  });

  it('shows a suspended company why, and offers to reinstate it', async () => {
    const user = userEvent.setup();
    renderAt('/admin/companies/shady');
    expect(await screen.findByText(/Insurance lapsed/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /reinstate company/i }));
    await waitFor(() => expect(dispatched()[0]).toMatchObject({ type: 'reinstateCompany', payload: { tenantId: 'shady' } }));
  });

  it('surfaces the server’s refusal rather than pretending it worked', async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValue({ json: async () => ({ ok: false, error: { code: 'forbidden', message: 'Your role does not permit this action.' } }) });
    renderAt('/admin/companies/shady');
    await user.click(await screen.findByRole('button', { name: /reinstate company/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Your role does not permit this action.');
  });
});

describe('People', () => {
  it('puts profile names and emails to members, and disables or re-roles them through dispatch', async () => {
    const user = userEvent.setup();
    renderAt('/admin/people');
    expect(await screen.findByText('Chris Waters')).toBeInTheDocument();
    expect(screen.getByText(/chris@waters\.test/)).toBeInTheDocument();

    const row = screen.getByText('Chris Waters').closest('li') as HTMLElement;
    await user.click(within(row).getByRole('button', { name: 'Disable' }));
    await user.selectOptions(within(row).getByRole('combobox', { name: /role for chris waters/i }), 'owner');

    await waitFor(() => expect(dispatched()).toHaveLength(2));
    expect(dispatched()[0]).toMatchObject({
      type: 'setMemberStatus',
      payload: { tenantId: 'waters', actorId: 'chris', status: 'disabled' },
    });
    expect(dispatched()[1]).toMatchObject({
      type: 'setMemberRole',
      payload: { tenantId: 'waters', actorId: 'chris', role: 'owner' },
    });
  });
});

describe('Loads', () => {
  it('only offers withdrawal on a load still on offer, and asks first', async () => {
    const user = userEvent.setup();
    renderAt('/admin/loads');
    const buttons = await screen.findAllByRole('button', { name: /withdraw load/i });
    expect(buttons).toHaveLength(1); // the taken load has none

    await user.click(buttons[0] as HTMLElement);
    expect(dispatched()).toHaveLength(0);
    await user.click(screen.getByRole('button', { name: /yes, withdraw it/i }));
    await waitFor(() =>
      expect(dispatched()[0]).toMatchObject({
        type: 'cancelLoad',
        payload: { shipperTenantId: 'acme', loadId: 'load-open' },
      })
    );
  });
});

describe('Activity', () => {
  it('says what happened in words, and hides location updates until asked', async () => {
    const user = userEvent.setup();
    renderAt('/admin/activity');
    expect(await screen.findByText(/suspended a company/)).toBeInTheDocument();
    expect(screen.getByText(/“Insurance lapsed”/)).toBeInTheDocument();
    expect(screen.queryByText(/location update$/)).not.toBeInTheDocument();

    await user.click(screen.getByRole('checkbox', { name: /include location updates/i }));
    expect(screen.getByText(/location update$/)).toBeInTheDocument();
  });
});

describe('marketplaceStats', () => {
  it('counts what a founder checks first, from the same data as the lists', () => {
    const delivered: Job = { ...(jobs[0] as Job), jobId: 'job-2', status: 'delivered', deliveredAt: '2026-10-25T12:00:00.000Z', priceGbpPence: 50_000 };
    const lastMonth: Job = { ...delivered, jobId: 'job-3', deliveredAt: '2026-09-25T12:00:00.000Z' };
    const stats = marketplaceStats(
      { companies, members, people, loads, jobs: [...jobs, delivered, lastMonth] },
      new Date('2026-10-27T12:00:00.000Z')
    );
    expect(stats).toEqual({
      companies: 3,
      suspended: 1,
      people: 2,
      onOffer: 1,
      underWay: 1,
      deliveredThisMonth: 1,
      valueThisMonth: 50_000,
    });
  });
});

describe('Billing (founder)', () => {
  it('will not save a link that is not Stripe’s, and saves real ones through dispatch', async () => {
    const user = userEvent.setup();
    renderAt('/admin/billing');
    const growth = await screen.findByRole('textbox', { name: 'Growth payment link' });

    await user.type(growth, 'https://example.test/pay');
    expect(screen.getByText(/Growth link is not a Stripe payment link/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /save billing settings/i })).toBeDisabled();

    await user.clear(growth);
    await user.type(growth, 'https://buy.stripe.com/test_g');
    await user.type(screen.getByRole('textbox', { name: 'Growth monthly price' }), '129');
    await user.click(screen.getByRole('checkbox'));
    await user.click(screen.getByRole('button', { name: /save billing settings/i }));

    await waitFor(() => expect(dispatched()).toHaveLength(1));
    expect(dispatched()[0]).toMatchObject({
      type: 'setBillingConfig',
      payload: {
        enforced: true,
        paymentLinks: { starter: '', growth: 'https://buy.stripe.com/test_g', fleet: '' },
        monthlyPricePence: { growth: 12900 },
      },
    });
  });

  it('lists every company with its plan, drivers included', async () => {
    renderAt('/admin/billing');
    expect(await screen.findByText('Acme Foods')).toBeInTheDocument();
    expect(screen.getByText('Waters Haulage')).toBeInTheDocument();
    // Fixtures signed up in September, so their trials are long over.
    expect(screen.getAllByText('No subscription').length).toBeGreaterThan(0);
  });

  it('gives a shipper a plan free from its company page, with a reason', async () => {
    const user = userEvent.setup();
    renderAt('/admin/companies/acme');
    await user.selectOptions(await screen.findByRole('combobox', { name: 'Plan to give' }), 'fleet');
    await user.type(screen.getByRole('textbox', { name: 'Why' }), 'Pilot customer');
    await user.click(screen.getByRole('button', { name: /give plan free/i }));
    await waitFor(() =>
      expect(dispatched()[0]).toMatchObject({
        type: 'setCompanyPlan',
        payload: { tenantId: 'acme', tier: 'fleet', note: 'Pilot customer' },
      })
    );
  });

  it('offers a carrier the Driver plan, and only that', async () => {
    renderAt('/admin/companies/waters');
    const select = await screen.findByRole('combobox', { name: 'Plan to give' });
    const options = Array.from((select as HTMLSelectElement).options).map((o) => o.value);
    expect(options).toEqual(['driver']);
  });
});

describe('Tracking switches', () => {
  it('switches a whole company off from its page, saying what that means for a carrier', async () => {
    const user = userEvent.setup();
    renderAt('/admin/companies/waters');
    const toggle = await screen.findByRole('switch', { name: 'Location tracking for Waters Haulage' });
    expect(toggle).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByText(/drivers’ phones report no position/)).toBeInTheDocument();
    expect(screen.getByText(/1 job under way/)).toBeInTheDocument();

    await user.click(toggle);
    await waitFor(() =>
      expect(dispatched()[0]).toMatchObject({ type: 'setCompanyTracking', payload: { tenantId: 'waters', enabled: false } })
    );
  });

  it('switches one driver off, and offers no switch to people who do not carry loads', async () => {
    const user = userEvent.setup();
    renderAt('/admin/people');
    await user.click(await screen.findByRole('switch', { name: 'Location tracking for Chris Waters' }));
    await waitFor(() =>
      expect(dispatched()[0]).toMatchObject({
        type: 'setMemberTracking',
        payload: { tenantId: 'waters', actorId: 'chris', enabled: false },
      })
    );
    // Ann works for a shipper-only company.
    expect(screen.queryByRole('switch', { name: 'Location tracking for Ann Acme' })).not.toBeInTheDocument();
  });
});
