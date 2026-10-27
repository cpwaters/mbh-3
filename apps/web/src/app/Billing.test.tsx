import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { DEFAULT_BILLING_CONFIG, type BillingConfig, type TenantBilling } from '@mbh/domain';
import Billing from './Billing';
import { AppProvider } from './context';
import { makeMockApp } from './stories/mock';

let config: BillingConfig = DEFAULT_BILLING_CONFIG;
let billing: TenantBilling | null = null;
let posted = 0;
let trial: { trialEndsAt?: string } = {};

vi.mock('../lib/reader', () => ({
  getReader: () => ({
    billingConfig: async () => config,
    // Signed up long ago, so the trial is over unless a test says otherwise.
    tenantPlan: async () => ({ createdAt: '2026-01-01T00:00:00.000Z', billing: billing ?? undefined, ...trial }),
    loadsPostedSince: async () => posted,
  }),
}));

const LIVE: BillingConfig = {
  enforced: true,
  paymentLinks: {
    starter: 'https://buy.stripe.com/test_s',
    growth: 'https://buy.stripe.com/test_g',
    driver: 'https://buy.stripe.com/test_d',
  },
  portalUrl: 'https://billing.stripe.com/p/login/test_p',
  monthlyPricePence: { starter: 4900, growth: 12900, driver: 999 },
};

function renderBilling(
  role: 'owner' | 'dispatcher' = 'owner',
  path = '/billing',
  capabilities: ('shipper' | 'carrier')[] = ['shipper']
) {
  const base = makeMockApp();
  const app = {
    ...base,
    selected: { tenantId: 'acme', name: 'Acme', role, capabilities },
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
  trial = {};
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

describe('Billing — the trial', () => {
  it('shows the trial with the day it ends and how long is left', async () => {
    trial = { trialEndsAt: new Date(Date.now() + 5 * 86_400_000 - 60_000).toISOString() };
    renderBilling();
    expect(await screen.findByText('Free trial')).toBeInTheDocument();
    expect(screen.getByText(/5 days left/)).toBeInTheDocument();
    // In the trial nothing is metered, so no "/ 3".
    expect(screen.queryByText('/ 3', { exact: false })).not.toBeInTheDocument();
  });
});

describe('Billing — drivers', () => {
  it('offers a driver the Driver plan only, at its own price', async () => {
    config = LIVE;
    renderBilling('owner', '/billing', ['carrier']);
    const link = await screen.findByRole('link', { name: 'Choose Driver' });
    expect(link).toHaveAttribute('href', expect.stringContaining('https://buy.stripe.com/test_d?client_reference_id=acme'));
    expect(screen.getByText('£9.99')).toBeInTheDocument();
    expect(screen.queryByText('Starter')).not.toBeInTheDocument();
    // A driver does not post, so there is no posting meter.
    expect(screen.queryByText('Loads posted this month')).not.toBeInTheDocument();
  });

  it('tells a driver whose trial has ended what to do', async () => {
    config = LIVE;
    renderBilling('owner', '/billing', ['carrier']);
    expect(await screen.findByText(/trial has ended\. Choose the Driver plan to accept loads/)).toBeInTheDocument();
  });

  it('shows a subscribed driver their plan', async () => {
    config = LIVE;
    billing = { stripeCustomerId: 'cus_d', stripeSubscriptionId: 'sub_d', tier: 'driver', status: 'active', override: null };
    renderBilling('owner', '/billing', ['carrier']);
    expect(await screen.findAllByText('Your plan')).toHaveLength(2);
    expect(screen.queryByRole('link', { name: 'Choose Driver' })).not.toBeInTheDocument();
  });
});
