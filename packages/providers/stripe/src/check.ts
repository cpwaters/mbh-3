import { PLAN_LABELS, PLAN_LOOKUP_KEYS, PLAN_TIERS, tierFromLookupKey, type PlanTier } from '@mbh/domain';
import { stripeFetch, type StripeFetch } from './provision.js';

// A READ-ONLY comparison of a Stripe account with what MyBackHaul expects —
// the founder runs it with their own key, it changes nothing, and it prints
// no secrets:
//
//   STRIPE_SECRET_KEY=sk_live_… pnpm stripe:check
//
// What the backend needs from Stripe, and so what this checks:
//   1. One monthly GBP price per plan, tagged with that plan's lookup key
//      (mbh_<plan>_monthly). The webhook reads the plan from the key; a
//      subscription to an untagged price gives the company no plan at all.
//   2. An active payment link per plan selling that price. A link selling a
//      one-off price makes a payment, not a subscription — the webhook
//      ignores it.
//   3. The webhook endpoint at <site>/api/billing/webhook with the four
//      events it handles.
//   4. The customer portal with its login page on (the "Manage subscription"
//      link).
//
// `pnpm stripe:provision` makes all of these. Anything made by hand in the
// dashboard is reported against the same list.

export const REQUIRED_WEBHOOK_EVENTS = [
  'checkout.session.completed',
  'customer.subscription.created',
  'customer.subscription.updated',
  'customer.subscription.deleted',
];

export type Severity = 'ok' | 'problem' | 'note';

export interface Finding {
  severity: Severity;
  message: string;
}

export interface AuditReport {
  mode: 'live' | 'test';
  findings: Finding[];
  // What to paste into Admin → Billing — none of it secret.
  paymentLinks: Partial<Record<PlanTier, string>>;
  monthlyPence: Partial<Record<PlanTier, number>>;
  portalUrl: string | null;
}

type StripeObject = Record<string, unknown>;
type List = { data: StripeObject[] };

const pounds = (pence: number) => `£${(pence / 100).toFixed(2)}`;

function describePrice(price: StripeObject): string {
  const amount = typeof price.unit_amount === 'number' ? pounds(price.unit_amount) : 'no amount';
  const recurring = price.recurring as { interval?: string; interval_count?: number } | null | undefined;
  const per = recurring ? `/${recurring.interval_count && recurring.interval_count > 1 ? `${recurring.interval_count} ` : ''}${recurring.interval}` : ' one-off';
  const product = price.product as StripeObject | string;
  const name = typeof product === 'object' && product !== null ? String(product.name ?? '') : '';
  return `${name ? `${name} ` : ''}${amount}${per} (${String(price.id)})`;
}

export async function audit(stripe: StripeFetch, siteUrl: string, mode: 'live' | 'test'): Promise<AuditReport> {
  const findings: Finding[] = [];
  const ok = (message: string) => findings.push({ severity: 'ok', message });
  const problem = (message: string) => findings.push({ severity: 'problem', message });
  const note = (message: string) => findings.push({ severity: 'note', message });

  // 1. Prices: every active price, so hand-made ones are seen too.
  const prices = (
    (await stripe('/v1/prices?active=true&limit=100&expand[]=data.product', { method: 'GET' })) as List
  ).data;
  const priceByTier = new Map<PlanTier, StripeObject>();
  for (const tier of PLAN_TIERS) {
    const price = prices.find((p) => p.lookup_key === PLAN_LOOKUP_KEYS[tier]);
    if (price === undefined) {
      problem(`${PLAN_LABELS[tier]}: no price tagged ${PLAN_LOOKUP_KEYS[tier]} — subscribers would get no plan.`);
      continue;
    }
    priceByTier.set(tier, price);
    const recurring = price.recurring as { interval?: string; interval_count?: number } | null;
    if (price.currency !== 'gbp') problem(`${PLAN_LABELS[tier]}: price is in ${String(price.currency)}, not GBP.`);
    else if (recurring == null || recurring.interval !== 'month' || (recurring.interval_count ?? 1) !== 1) {
      problem(`${PLAN_LABELS[tier]}: price is not monthly — ${describePrice(price)}.`);
    } else ok(`${PLAN_LABELS[tier]}: ${describePrice(price)}.`);
  }
  for (const price of prices) {
    if (tierFromLookupKey(price.lookup_key as string | null) !== null) continue;
    if (price.recurring == null) continue; // one-off prices are reported only if a link sells them
    problem(
      `Untagged subscription price: ${describePrice(price)}. The backend cannot tell which plan it is, so a ` +
        'subscriber would get no plan. Use the tagged one instead, or archive it.'
    );
  }

  // 2. Payment links, by the price each one sells.
  const links = ((await stripe('/v1/payment_links?active=true&limit=100', { method: 'GET' })) as List).data;
  const paymentLinks: Partial<Record<PlanTier, string>> = {};
  for (const link of links) {
    const items = (
      (await stripe(`/v1/payment_links/${String(link.id)}/line_items?limit=10`, { method: 'GET' })) as List
    ).data;
    const price = items[0]?.price as StripeObject | undefined;
    const url = String(link.url);
    if (price === undefined) {
      problem(`Payment link ${url} sells nothing we can see.`);
      continue;
    }
    if (price.recurring == null) {
      problem(`Payment link ${url} sells a one-off price, ${describePrice(price)} — that takes a payment, not a subscription, and gives no plan.`);
      continue;
    }
    const tier = tierFromLookupKey(price.lookup_key as string | null);
    if (tier === null) {
      problem(`Payment link ${url} sells an untagged price, ${describePrice(price)} — subscribers would get no plan.`);
      continue;
    }
    if (paymentLinks[tier] !== undefined) {
      note(`${PLAN_LABELS[tier]}: more than one link (${paymentLinks[tier]} and ${url}); either works.`);
      continue;
    }
    paymentLinks[tier] = url;
    const after = link.after_completion as { type?: string; redirect?: { url?: string } } | undefined;
    const back = `${siteUrl}/app/billing?checkout=done`;
    if (after?.type !== 'redirect' || after.redirect?.url !== back) {
      note(`${PLAN_LABELS[tier]} link does not send the customer back to ${back} after paying (they stay on Stripe's thank-you page).`);
    }
  }
  for (const tier of PLAN_TIERS) {
    if (paymentLinks[tier] !== undefined) ok(`${PLAN_LABELS[tier]} payment link: ${paymentLinks[tier]}`);
    else problem(`${PLAN_LABELS[tier]}: no active payment link selling its tagged price.`);
  }

  // 3. The webhook.
  const webhookUrl = `${siteUrl}/api/billing/webhook`;
  const endpoints = ((await stripe('/v1/webhook_endpoints?limit=100', { method: 'GET' })) as List).data;
  const endpoint = endpoints.find((e) => e.url === webhookUrl);
  if (endpoint === undefined) {
    problem(`No webhook endpoint at ${webhookUrl} — payments would never reach MyBackHaul.`);
  } else {
    const events = (endpoint.enabled_events as string[] | undefined) ?? [];
    const missing = events.includes('*') ? [] : REQUIRED_WEBHOOK_EVENTS.filter((e) => !events.includes(e));
    if (endpoint.status !== 'enabled') problem(`Webhook endpoint ${webhookUrl} is ${String(endpoint.status)}.`);
    else if (missing.length > 0) problem(`Webhook endpoint is missing events: ${missing.join(', ')}.`);
    else ok(`Webhook endpoint ${webhookUrl} with all ${REQUIRED_WEBHOOK_EVENTS.length} events.`);
  }
  for (const other of endpoints) {
    if (other.url !== webhookUrl && String(other.url).includes('/api/billing')) {
      note(`Another endpoint points at ${String(other.url)} — only ${webhookUrl} is ours.`);
    }
  }

  // 4. The customer portal's login page.
  const configs = ((await stripe('/v1/billing_portal/configurations?limit=100', { method: 'GET' })) as List).data;
  const withLogin = configs.find((c) => (c.login_page as { enabled?: boolean; url?: string } | undefined)?.enabled);
  const portalUrl = (withLogin?.login_page as { url?: string } | undefined)?.url ?? null;
  if (portalUrl === null) {
    problem('Customer portal login page is off — the "Manage subscription" link has nowhere to go.');
  } else ok(`Customer portal login page: ${portalUrl}`);

  const monthlyPence: Partial<Record<PlanTier, number>> = {};
  for (const [tier, price] of priceByTier) {
    if (typeof price.unit_amount === 'number') monthlyPence[tier] = price.unit_amount;
  }

  return { mode, findings, paymentLinks, monthlyPence, portalUrl };
}

export function formatReport(report: AuditReport): string {
  const mark: Record<Severity, string> = { ok: '  ✓', problem: '  ✗', note: '  ·' };
  const problems = report.findings.filter((f) => f.severity === 'problem').length;
  const lines = [
    `Stripe (${report.mode} mode) against what MyBackHaul expects:`,
    ...report.findings.map((f) => `${mark[f.severity]} ${f.message}`),
    '',
    problems === 0
      ? 'Everything the backend needs is in place.'
      : `${problems} problem${problems === 1 ? '' : 's'}. \`pnpm stripe:provision\` with the same key creates whatever is missing (it changes nothing that is already right).`,
    '',
    'For Admin → Billing (none of this is secret):',
    ...PLAN_TIERS.map(
      (tier) =>
        `  ${PLAN_LABELS[tier].padEnd(16)} ${report.paymentLinks[tier] ?? '—'}   ${
          report.monthlyPence[tier] !== undefined ? `${pounds(report.monthlyPence[tier] as number)}/month` : ''
        }`
    ),
    `  ${'Portal'.padEnd(16)} ${report.portalUrl ?? '—'}`,
  ];
  return lines.join('\n');
}

async function main(): Promise<void> {
  const key = process.env.STRIPE_SECRET_KEY ?? '';
  if (!/^(sk|rk)_(test|live)_/.test(key)) {
    console.error('Set STRIPE_SECRET_KEY in your own shell (a restricted read-only key is enough). Never paste it into a chat.');
    process.exit(1);
  }
  const siteUrl = (process.env.SITE_URL ?? 'https://mybackhaul-app.web.app').replace(/\/$/, '');
  const mode = key.includes('_live_') ? 'live' : 'test';
  console.log(formatReport(await audit(stripeFetch(key), siteUrl, mode)));
}

if (process.argv[1] !== undefined && import.meta.url.endsWith(process.argv[1].split('/').pop() ?? '\0')) {
  main().catch((err: unknown) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
