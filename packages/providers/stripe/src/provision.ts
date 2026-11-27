import { PLAN_LABELS, PLAN_LOOKUP_KEYS, PLAN_TIERS, type PlanTier } from '@mbh/domain';
import { encodeForm, stripeFetch, type StripeFetch } from './stripe-rest.js';

// Sets up Stripe for MyBackHaul through the REST API, not by clicking around
// the dashboard (architecture.md, Payments): one product + monthly price per
// tier (tagged with the lookup key the webhook reads the tier from), a
// payment link for each, the customer portal with its login page, and the
// webhook endpoint.
//
// Run by the founder, with their own key, on their own machine:
//
//   STRIPE_SECRET_KEY=sk_test_… pnpm stripe:provision
//
// Safe to run again: everything is found by lookup key / metadata / URL
// before anything is created, so a second run changes nothing. Start with a
// TEST-mode key; run once more with the live key when ready.
//
// The key is read from the environment and never written anywhere. The one
// secret this prints — the webhook signing secret, shown by Stripe only when
// the endpoint is first created — goes straight into the GitHub Actions
// secret STRIPE_WEBHOOK_SECRET, and nowhere else (not a chat, not the repo).

export { encodeForm, stripeFetch, type StripeFetch };

// Display prices, in pence per month. PLACEHOLDERS — set the real ones with
// the env vars below before running against the live account. Stripe charges
// exactly what the Price says; the back office's Billing tab only shows these.
export const DEFAULT_MONTHLY_PENCE: Record<PlanTier, number> = {
  starter: 4_900,
  growth: 12_900,
  fleet: 29_900,
  // A person, not a company — priced well under the cheapest shipper plan.
  driver_new: 799,
  driver_fleet: 1_499,
  driver_pro: 2_499,
  // A company that both ships and carries: Fleet's unlimited posting with
  // Driver Pro's unlimited pick-ups, for a little under the two together.
  dual_operator: 31_900,
};

const WEBHOOK_EVENTS = [
  'checkout.session.completed',
  'customer.subscription.created',
  'customer.subscription.updated',
  'customer.subscription.deleted',
];

export interface ProvisionOptions {
  siteUrl: string; // e.g. https://mybackhaul-app.web.app
  monthlyPence: Record<PlanTier, number>;
  log: (line: string) => void;
  // Prices already made by hand in the dashboard, by plan: tagged with that
  // plan's lookup key instead of a new price being created. From
  // ADOPT_PRICES=starter=price_…,driver_new=price_… (see stripe:check, which
  // lists the untagged prices and their ids).
  adoptPrices?: Partial<Record<PlanTier, string>>;
}

// ADOPT_PRICES="starter=price_123,growth=price_456" → { starter: 'price_123', … }
export function parseAdoptPrices(raw: string | undefined): Partial<Record<PlanTier, string>> {
  const out: Partial<Record<PlanTier, string>> = {};
  if (raw === undefined || raw.trim() === '') return out;
  for (const pair of raw.split(',')) {
    const [tier, priceId] = pair.split('=').map((x) => x.trim());
    if (!(PLAN_TIERS as readonly string[]).includes(tier ?? '')) {
      throw new Error(`ADOPT_PRICES: "${tier ?? ''}" is not a plan (one of ${PLAN_TIERS.join(', ')}).`);
    }
    if (priceId === undefined || !/^price_[A-Za-z0-9]+$/.test(priceId)) {
      throw new Error(`ADOPT_PRICES: "${priceId ?? ''}" for ${tier} is not a price id (price_…).`);
    }
    out[tier as PlanTier] = priceId;
  }
  return out;
}

export interface ProvisionResult {
  prices: Record<PlanTier, string>;
  paymentLinks: Record<PlanTier, string>;
  portalUrl: string;
  webhook: { id: string; created: boolean; secret: string | null };
}

type List = { data: Record<string, unknown>[] };

export async function provision(stripe: StripeFetch, options: ProvisionOptions): Promise<ProvisionResult> {
  const { siteUrl, monthlyPence, log, adoptPrices = {} } = options;
  const prices = {} as Record<PlanTier, string>;
  const products = {} as Record<PlanTier, string>;

  // 1. A product + monthly GBP price per tier, found by lookup key.
  for (const tier of PLAN_TIERS) {
    const lookupKey = PLAN_LOOKUP_KEYS[tier];
    const found = (await stripe(`/v1/prices?lookup_keys[]=${lookupKey}&active=true`, { method: 'GET' })) as List;
    const existing = found.data[0];
    if (existing !== undefined) {
      prices[tier] = existing.id as string;
      products[tier] = existing.product as string;
      if (existing.unit_amount !== monthlyPence[tier]) {
        log(
          `  ! ${PLAN_LABELS[tier]}: existing price is ${String(existing.unit_amount)}p, not ${monthlyPence[tier]}p. ` +
            'Stripe prices cannot change amount — create a new price in the dashboard and move the lookup key to it.'
        );
      }
      log(`  = ${PLAN_LABELS[tier]} price ${prices[tier]} (exists)`);
      continue;
    }
    const adopt = adoptPrices[tier];
    if (adopt !== undefined) {
      // A price made by hand: tag it, so the webhook knows which plan its
      // subscribers are on. Its amount is whatever it was made with.
      const tagged = await stripe(`/v1/prices/${adopt}`, {
        method: 'POST',
        form: { lookup_key: lookupKey, transfer_lookup_key: 'true', 'metadata[mbh_tier]': tier },
      });
      if (tagged.recurring == null || (tagged.recurring as { interval?: string }).interval !== 'month') {
        throw new Error(`${PLAN_LABELS[tier]}: ${adopt} is not a monthly subscription price, so it cannot be a plan.`);
      }
      prices[tier] = adopt;
      products[tier] = tagged.product as string;
      log(`  ~ ${PLAN_LABELS[tier]} price ${adopt} (yours, now tagged ${lookupKey})`);
      continue;
    }
    const product = await stripe('/v1/products', {
      method: 'POST',
      form: { name: `MyBackHaul ${PLAN_LABELS[tier]}`, 'metadata[mbh_tier]': tier },
    });
    const price = await stripe('/v1/prices', {
      method: 'POST',
      form: {
        product: product.id as string,
        currency: 'gbp',
        unit_amount: String(monthlyPence[tier]),
        'recurring[interval]': 'month',
        lookup_key: lookupKey,
        'metadata[mbh_tier]': tier,
      },
    });
    prices[tier] = price.id as string;
    products[tier] = product.id as string;
    log(`  + ${PLAN_LABELS[tier]} price ${prices[tier]}`);
  }

  // 2. A payment link per tier — one of ours (by metadata), or one made by
  //    hand that already sells the plan's price, so nothing is duplicated.
  //    client_reference_id is appended per company by the Billing page, not
  //    baked in here.
  const paymentLinks = {} as Record<PlanTier, string>;
  const links = (await stripe('/v1/payment_links?active=true&limit=100', { method: 'GET' })) as List;
  const linkPrice = new Map<string, string>();
  for (const link of links.data) {
    const items = (await stripe(`/v1/payment_links/${String(link.id)}/line_items?limit=10`, { method: 'GET' })) as List;
    const sold = items.data[0]?.price as { id?: string } | string | undefined;
    const soldId = typeof sold === 'string' ? sold : sold?.id;
    if (soldId !== undefined) linkPrice.set(String(link.id), soldId);
  }
  for (const tier of PLAN_TIERS) {
    const existing =
      links.data.find((l) => (l.metadata as Record<string, string> | undefined)?.mbh_tier === tier) ??
      links.data.find((l) => linkPrice.get(String(l.id)) === prices[tier]);
    if (existing !== undefined) {
      paymentLinks[tier] = existing.url as string;
      log(`  = ${PLAN_LABELS[tier]} payment link (exists)`);
      continue;
    }
    const link = await stripe('/v1/payment_links', {
      method: 'POST',
      form: {
        'line_items[0][price]': prices[tier],
        'line_items[0][quantity]': '1',
        'after_completion[type]': 'redirect',
        'after_completion[redirect][url]': `${siteUrl}/app/billing?checkout=done`,
        'metadata[mbh_tier]': tier,
      },
    });
    paymentLinks[tier] = link.url as string;
    log(`  + ${PLAN_LABELS[tier]} payment link`);
  }

  // 3. The customer portal: card, invoices, cancel at period end, and
  //    switching between the three tiers. With its no-code login page, so the
  //    app can link to it without ever calling Stripe in a user's request.
  const portalForm: Record<string, string> = {
    'business_profile[headline]': 'MyBackHaul — manage your plan',
    'features[customer_update][enabled]': 'true',
    'features[customer_update][allowed_updates][0]': 'email',
    'features[customer_update][allowed_updates][1]': 'address',
    'features[customer_update][allowed_updates][2]': 'tax_id',
    'features[invoice_history][enabled]': 'true',
    'features[payment_method_update][enabled]': 'true',
    'features[subscription_cancel][enabled]': 'true',
    'features[subscription_cancel][mode]': 'at_period_end',
    'features[subscription_update][enabled]': 'true',
    'features[subscription_update][default_allowed_updates][0]': 'price',
    'features[subscription_update][proration_behavior]': 'create_prorations',
    'login_page[enabled]': 'true',
    'metadata[mbh]': 'portal',
  };
  // Every plan is switchable in the portal — a driver moving up a Driver plan
  // is the switch that matters most now. Stripe allows one product list per
  // portal, so a shipper could pick a Driver plan there too; that only
  // lowers its own posting allowance, so it corrects itself.
  PLAN_TIERS.forEach((tier, i) => {
    portalForm[`features[subscription_update][products][${i}][product]`] = products[tier];
    portalForm[`features[subscription_update][products][${i}][prices][0]`] = prices[tier];
  });
  const configs = (await stripe('/v1/billing_portal/configurations?limit=100', { method: 'GET' })) as List;
  const ours = configs.data.find((c) => (c.metadata as Record<string, string> | undefined)?.mbh === 'portal');
  const portal = await stripe(
    ours !== undefined ? `/v1/billing_portal/configurations/${ours.id as string}` : '/v1/billing_portal/configurations',
    { method: 'POST', form: portalForm }
  );
  const portalUrl = ((portal.login_page as { url?: string } | undefined)?.url ?? '') as string;
  log(`  ${ours !== undefined ? '~' : '+'} customer portal`);

  // 4. The webhook endpoint, found by URL. Stripe shows its signing secret
  //    ONLY in the create response.
  const webhookUrl = `${siteUrl}/api/billing/webhook`;
  const endpoints = (await stripe('/v1/webhook_endpoints?limit=100', { method: 'GET' })) as List;
  const endpoint = endpoints.data.find((e) => e.url === webhookUrl);
  let webhook: ProvisionResult['webhook'];
  if (endpoint !== undefined) {
    const form: Record<string, string> = {};
    WEBHOOK_EVENTS.forEach((event, i) => (form[`enabled_events[${i}]`] = event));
    await stripe(`/v1/webhook_endpoints/${endpoint.id as string}`, { method: 'POST', form });
    webhook = { id: endpoint.id as string, created: false, secret: null };
    log('  = webhook endpoint (exists — its secret was shown when it was created)');
  } else {
    const form: Record<string, string> = { url: webhookUrl, description: 'MyBackHaul subscriptions' };
    WEBHOOK_EVENTS.forEach((event, i) => (form[`enabled_events[${i}]`] = event));
    const created = await stripe('/v1/webhook_endpoints', { method: 'POST', form });
    webhook = { id: created.id as string, created: true, secret: created.secret as string };
    log('  + webhook endpoint');
  }

  return { prices, paymentLinks, portalUrl, webhook };
}

function penceFromEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const n = Number(raw);
  if (!Number.isInteger(n) || n <= 0) throw new Error(`${name} must be a whole number of pence, got "${raw}"`);
  return n;
}

async function main(): Promise<void> {
  const key = process.env.STRIPE_SECRET_KEY ?? '';
  if (!/^(sk|rk)_(test|live)_/.test(key)) {
    console.error('Set STRIPE_SECRET_KEY (sk_test_… first) in your own shell. Never paste it into a chat or a file in the repo.');
    process.exit(1);
  }
  const siteUrl = (process.env.SITE_URL ?? 'https://mybackhaul-app.web.app').replace(/\/$/, '');
  const adoptPrices = parseAdoptPrices(process.env.ADOPT_PRICES);
  const monthlyPence = {
    starter: penceFromEnv('STARTER_PENCE', DEFAULT_MONTHLY_PENCE.starter),
    growth: penceFromEnv('GROWTH_PENCE', DEFAULT_MONTHLY_PENCE.growth),
    fleet: penceFromEnv('FLEET_PENCE', DEFAULT_MONTHLY_PENCE.fleet),
    driver_new: penceFromEnv('DRIVER_NEW_PENCE', DEFAULT_MONTHLY_PENCE.driver_new),
    driver_fleet: penceFromEnv('DRIVER_FLEET_PENCE', DEFAULT_MONTHLY_PENCE.driver_fleet),
    driver_pro: penceFromEnv('DRIVER_PRO_PENCE', DEFAULT_MONTHLY_PENCE.driver_pro),
    dual_operator: penceFromEnv('DUAL_OPERATOR_PENCE', DEFAULT_MONTHLY_PENCE.dual_operator),
  };

  console.log(`Provisioning Stripe (${key.startsWith('sk_live_') || key.startsWith('rk_live_') ? 'LIVE' : 'test'} mode) for ${siteUrl}`);
  const result = await provision(stripeFetch(key), { siteUrl, monthlyPence, adoptPrices, log: (l) => console.log(l) });

  console.log('\nPaste these into the back office → Billing (none are secret):');
  for (const tier of PLAN_TIERS) {
    console.log(`  ${PLAN_LABELS[tier].padEnd(16)} ${result.paymentLinks[tier]}   £${(monthlyPence[tier] / 100).toFixed(2)}/month`);
  }
  console.log(`  Portal   ${result.portalUrl}`);

  if (result.webhook.secret !== null) {
    console.log('\nWebhook signing secret — Stripe shows this ONCE. Put it in GitHub → Settings → Secrets and');
    console.log('variables → Actions → New repository secret, named STRIPE_WEBHOOK_SECRET, then re-run the');
    console.log('deploy. Do not paste it anywhere else.\n');
    console.log(`  ${result.webhook.secret}\n`);
  } else {
    console.log('\nWebhook endpoint already existed. If STRIPE_WEBHOOK_SECRET is not set in GitHub yet, roll the');
    console.log("endpoint's signing secret in the Stripe dashboard and set it there.");
  }
}

// Only when run directly (pnpm stripe:provision), never on import in tests.
if (process.argv[1] !== undefined && import.meta.url.endsWith(process.argv[1].split('/').pop() ?? '\0')) {
  main().catch((err: unknown) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
