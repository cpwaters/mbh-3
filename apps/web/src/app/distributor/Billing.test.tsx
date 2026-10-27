import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { DEFAULT_BILLING_CONFIG, type BillingConfig, type TenantBilling } from '@mbh/domain';
import Billing from './Billing';
import { AppProvider } from '../context';
import { makeMockApp } from '../stories/mock';

let config: BillingConfig = DEFAULT_BILLING_CONFIG;
let billing: TenantBilling | null = null;
let posted = 0;

vi.mock('../../lib/reader', () => ({
  getReader: () => ({
    billingConfig: async () => config,
    tenantBilling: async () => billing,
    loadsPostedSince: async () => posted,
  }),
}));

const LIVE: BillingConfig = {
  enforced: true,
  paymentLinks: { starter: 'https://buy.stripe.com/test_s', growth: 'https://buy.stripe.com/test_g' },
  portalUrl: 'https://billing.stripe.com/p/login/test_p',
  monthlyPricePence: { starter: 4900, growth: 12900 },
};

function renderBilling(role: 'owner' | 'dispatcher' = 'owner', path = '/billing') {
  const base = makeMockApp();
  const app = {
    ...base,
    selected: { tenantId: 'acme', name: 'Acme', role, capabilities: ['shipper' as const] },
    auth: { ...base.auth, session: { actorId: 'ann', email: 'ann@acme.test', displayName: 'Ann' } },
  };
  return render(
    <AppProvider value={app}>
      <MemoryRouter initialEntries={[path]}>
        <Billing />
      </MemoryRouter>
    </AppProvider>
  );
}

afterEach(() => {
  config = DEFAULT_BILLING_CONFIG;
  billing = null;
  posted = 0;
});

describe('Billing', () => {
  it('shows the free allowance and what is used of it, and says when nothing is enforced yet', async () => {
    posted = 2;
    renderBilling();
    expect(await screen.findByText('Free')).toBeInTheDocument();
    expect(screen.getByText('/ 3', { exact: false })).toBeInTheDocument();
    expect(screen.getByText(/not being enforced yet/)).toBeInTheDocument();
    // No links configured: plans say so rather than offering a dead button.
    expect(screen.getAllByText('Opening soon')).toHaveLength(3);
  });

  it('sends an owner to Stripe with the company and their email attached', async () => {
    config = LIVE;
    renderBilling();
    const link = await screen.findByRole('link', { name: 'Choose Growth' });
    expect(link).toHaveAttribute(
      'href',
      'https://buy.stripe.com/test_g?client_reference_id=acme&prefilled_email=ann%40acme.test'
    );
    expect(screen.getByText('£129.00')).toBeInTheDocument();
    expect(screen.queryByText(/not being enforced/)).not.toBeInTheDocument();
  });

  it('leaves changing plan to the owner', async () => {
    config = LIVE;
    renderBilling('dispatcher');
    expect(await screen.findAllByText(/ask your company’s owner/i)).toHaveLength(2);
    expect(screen.queryByRole('link', { name: /choose/i })).not.toBeInTheDocument();
  });

  it('sends an existing subscriber to the portal to switch, rather than starting a second subscription', async () => {
    config = LIVE;
    billing = {
      stripeCustomerId: 'cus_1',
      stripeSubscriptionId: 'sub_1',
      tier: 'starter',
      status: 'active',
      currentPeriodEnd: '2026-11-27T11:00:00.000Z',
      override: null,
    };
    renderBilling();
    expect(await screen.findByText(/Renews on 27 November 2026/)).toBeInTheDocument();
    // The heading of the plan card, and the marker on the Starter card.
    expect(screen.getAllByText('Your plan')).toHaveLength(2);
    expect(screen.getByRole('link', { name: /switch to growth/i })).toHaveAttribute(
      'href',
      'https://billing.stripe.com/p/login/test_p?prefilled_email=ann%40acme.test'
    );
    expect(screen.getByRole('link', { name: /manage subscription/i })).toBeInTheDocument();
  });

  it('warns plainly when a renewal has failed', async () => {
    config = LIVE;
    billing = { stripeCustomerId: 'cus_1', stripeSubscriptionId: 'sub_1', tier: 'growth', status: 'past_due', override: null };
    renderBilling();
    expect(await screen.findByText(/last payment did not go through/)).toBeInTheDocument();
  });

  it('thanks the shipper back from checkout without claiming the plan has changed yet', async () => {
    renderBilling('owner', '/billing?checkout=done');
    expect(await screen.findByText(/appears here as soon as Stripe confirms it/)).toBeInTheDocument();
  });
});
