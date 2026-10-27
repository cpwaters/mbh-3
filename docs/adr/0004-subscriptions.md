# ADR-0004: Subscriptions — Stripe payment links, a verified webhook, and allowances

## Status

Accepted. Built; dormant until the founder provisions Stripe and switches
enforcement on (docs/runbooks/billing.md).

## Context

The product brief settles who pays and how: shippers pay, drivers ride free.
There are three Stripe tiers (Starter / Growth / Fleet), the tier is derived
from the Price, and there is no per-load commission. Architecture.md sets the
shape: Checkout + Customer Portal + a signature-verified webhook, fail-closed
until secrets exist, provisioned through the REST API, with system-only status
recording.

Two non-negotiables constrain how:

- **#6, third-party calls never happen synchronously in a user request.**
  Creating a Checkout Session or a Portal Session on click is exactly such a
  call.
- **#2, one mutation path.** "No … webhook writes business documents
  directly."

## Decision

1. **Payment Links, not Checkout Sessions.** Each tier has a payment link
   created once by provisioning. The Billing page appends
   `client_reference_id=<tenantId>` (plus `prefilled_email`), so Stripe
   carries the company through to `checkout.session.completed`. No server
   call happens in the request, and nothing is waiting on the drain.
2. **The portal's no-code login page, not Portal Sessions.** Provisioning
   enables `login_page` on our portal configuration. The app links to it, and
   the customer gets a one-time code by email. Again, no server call.
3. **The webhook is the only way Stripe's word enters the system.** POST
   `/api/billing/webhook` (on the existing dispatch function, so still two
   functions) does three things:
   - verifies the `Stripe-Signature` HMAC itself (no SDK; @mbh/provider-stripe)
   - maps the body through @mbh/wire's Zod schema to a domain `BillingEvent`
   - dispatches `recordBillingEvent` as a **system** action. `ctx.source` is
     set by the boundary, never by the request, so a member (the founder
     included) is refused it through `/api/dispatch`.

   The Stripe event id is the idempotency key, so a redelivery is answered
   from the marker. With no `STRIPE_WEBHOOK_SECRET` the route answers 503 to
   everything, and smoke:prod checks that a forged signature never gets a 2xx.
4. **Out-of-order events.** Stripe does not order `checkout.session.completed`
   (which names the company) before the subscription events (which name the
   plan). Both accumulate in `billingCustomers/{customerId}`, and the company's
   `billing` map is projected whenever both halves are known. Each
   subscription event's Stripe timestamp is kept, so a late, older event
   cannot roll the plan back.
5. **Tier from the price's lookup key** (`mbh_<tier>_monthly`). It travels on
   every subscription event, so no price-id mapping is configured anywhere.
   An unknown key or status entitles to nothing (fail closed on money).
6. **What a plan buys is a monthly allowance of posted loads**: Free 3,
   Starter 25, Growth 100, Fleet unlimited. Counted inside postLoad's
   transaction, cancelled loads included. Carrier work is never metered.
   `past_due` keeps the plan while Stripe retries, and `unpaid` or `canceled`
   ends it.
7. **Enforcement is a founder switch** (`platformConfig/billing.enforced`, set
   from the back office). Shipping this code changes nothing for anyone until
   it is on. Turning it on with no payment link is refused, because a shipper
   at their limit would have nowhere to pay.
8. **The founder can give a plan** (`setCompanyPlan`, an override beside the
   Stripe state, never over it). Removing the override returns the company to
   exactly what it pays for.

## Consequences

- Upgrading or downgrading an existing subscriber happens in the portal, not
  through a second payment link. The Billing page sends subscribers there.
- Prices live in Stripe and cannot change amount. A price change means a new
  Price with the lookup key moved to it. The display prices in the back office
  are just that: display.
- The allowance numbers are in `packages/domain/src/billing.ts`. Changing
  them is a code change, reviewed like any other.
- The webhook secret follows the SMTP stopgap (a GitHub Actions secret written
  to functions/.env at deploy) until the Secret Manager migration lands for
  both.

## Addendum (October 2026): a free trial for everyone, and a Driver plan

The founder extended the model: **every sign-up gets a 14-day free trial,
and drivers subscribe too**, at a lower individual price.

- **Trial.** `createTenant` stamps `trialEndsAt` (now + 14 days). Companies
  from before trials existed count 14 days from `createdAt`. A trial is full
  access: unlimited posting, and accepting loads. `effectivePlan` decides
  in this order: the founder's override, then a Stripe subscription in good
  standing, then the trial, then free. No card is taken for the trial.
  Subscribing during it starts billing then, so the Billing page says
  "choose a plan any time before then".
- **Driver plan** (`mbh_driver_monthly`, placeholder £9.99/month). Signing up
  as a carrier creates a one-person carrier company, so the plan sits on the
  company like any other plan. That means the same webhook, payment links
  and portal, with no per-person billing machinery. It buys **accepting
  loads**; for posting, it is the free allowance.
- **Accept gate.** Once the trial is over, `acceptLoad` needs any plan, a
  shipper plan included (a company that does both is covered by it). Work
  already accepted is never stopped: collecting and delivering stay free.
- Both gates still wait on the founder's enforcement switch.
- The portal's plan-switching offers the shipper plans only. The Driver plan
  has nothing to switch to.
