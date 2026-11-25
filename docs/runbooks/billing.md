# Runbook: switching on subscriptions

Billing ships dormant. Until the steps below are done, every shipper can post
as many loads as they like, the Billing page says that plans are not enforced
yet, and the webhook answers 503 to everything. Do it in **test mode** first,
then repeat with the live key.

Secrets in this runbook (your Stripe secret key and the webhook signing
secret) go only where it says: your own shell and GitHub's secret store.
Never put them in a chat, an issue, a commit or a file in the repo.

## Payment Links or Subscriptions?

Both, in different places. A **payment link** is the checkout page a shipper or
driver is sent to from Billing, so the plans' links live under **Payment
Links**. When someone pays through a link that sells a *monthly recurring*
price, Stripe creates a **Subscription** for them, under **Billing →
Subscriptions**. That subscription is what renews each month and what the
webhook reports to MyBackHaul. The plans themselves (products and prices) live
under **Product catalogue**. Nothing needs moving. What matters is that each
link sells a recurring monthly price tagged with its plan's lookup key, and
`pnpm stripe:check` tells you whether it does.

## 0. Check what is there already

    STRIPE_SECRET_KEY=rk_live_... pnpm stripe:check

A restricted key with read access is enough; the check changes nothing. It
compares the account with what the backend expects and lists each problem:

- **Prices:** a plan with no price tagged `mbh_<plan>_monthly`, an untagged
  subscription price (subscribers to it would get no plan), or a price that is
  not monthly.
- **Payment links:** a link selling a one-off price (that takes a payment, not
  a subscription) or an untagged price.
- **Webhook:** no endpoint at `/api/billing/webhook`, or missing events.
- **Customer portal:** the login page is off.

At the end it prints the links, prices and portal URL to paste into the back
office.

### If you made products, prices or links by hand

The check lists your untagged prices with their ids (`price_...`). Tell
provisioning which plan each one is, and it **tags your prices** instead of
making new ones. It also reuses a link that already sells the right price:

    STRIPE_SECRET_KEY=sk_live_... \
    ADOPT_PRICES=starter=price_AAA,growth=price_BBB,fleet=price_CCC,driver_new=price_DDD,driver_fleet=price_EEE,driver_pro=price_FFF,dual_operator=price_GGG \
    pnpm stripe:provision

Any plan left out of `ADOPT_PRICES` gets a fresh price at the amount in step 1.
A price must be a monthly subscription price to be adopted. Afterwards, archive
any links the check flagged as one-off or untagged so nobody pays through them,
then run `pnpm stripe:check` again until it reports no problems.

## 1. Set the prices (optional)

The provisioning script creates these monthly GBP prices unless told
otherwise: Starter £49, Growth £129 and Fleet £299 for shippers, Driver
New £7.99, Driver Fleet £14.99 and Driver Pro £24.99 for drivers, and
Dual Operator Unlimited £319 for a company that does both. **They are
placeholders.** To use your own, set them in pence when you run step 2:

    STARTER_PENCE=3900 GROWTH_PENCE=9900 FLEET_PENCE=24900 \
    DRIVER_NEW_PENCE=699 DRIVER_FLEET_PENCE=1299 DRIVER_PRO_PENCE=1999 \
    DUAL_OPERATOR_PENCE=29900

A Stripe price's amount cannot change once created. To change a price later,
create a new one in the dashboard and move its lookup key
(`mbh_<tier>_monthly`) onto it.

## 2. Provision Stripe

In your own terminal, from the repo root:

    STRIPE_SECRET_KEY=sk_test_... pnpm stripe:provision

This sets up the following through Stripe's API:
- one product and one monthly price per tier, each tagged with its lookup key
- a payment link for each tier, which returns the customer to
  `/app/billing?checkout=done`
- the customer portal (card, invoices, cancel at period end, switch tier) with
  its login page
- the webhook endpoint at `https://mybackhaul-app.web.app/api/billing/webhook`

It is safe to run again: on a second run it finds everything it made and
creates nothing new.

## 3. Give the deploy the webhook secret

The first run prints the webhook signing secret (`whsec_…`). Stripe shows it
only once. Copy it straight into:

GitHub → the repo → Settings → Secrets and variables → Actions → New
repository secret, named `STRIPE_WEBHOOK_SECRET`.

Then re-run the latest `ci` workflow on main (Actions → ci → Run workflow) so
the deploy writes it into the function's environment. smoke:prod then expects
400 rather than 503 for a forged signature.

If you lose the secret, roll it in the Stripe dashboard (Developers →
Webhooks → the endpoint → Roll secret) and update the GitHub secret.

## 4. Paste the links into the back office

In /app/admin → Billing, paste the seven payment links (three shipper plans,
the three Driver plans and Dual Operator Unlimited) and the portal link
the script printed, along with the monthly prices to display. Save, leaving "Enforce plans" off.

## 5. Prove it end to end (test mode)

1. Sign in as a shipper owner, open Billing, choose a plan, and pay with
   Stripe's test card `4242 4242 4242 4242`.
2. You land back on Billing. Within a minute the plan shows as the one you
   chose, with a renewal date.
3. In the back office, Activity shows "recordBillingEvent" from the system,
   and Billing lists the shipper on that plan.
4. Use "Manage subscription" to switch tier, then cancel. Both show up the
   same way.

## 6. Enforce

Tick "Enforce plans" in the back office and save. From then on:
- Every company gets everything free for 30 days from sign-up. Companies
  created before trials existed count 30 days from when they were created,
  so many will already be past it. Give any you want to keep a plan first
  (below).
- After the trial, a company with no plan can post **one load a day** and
  pick up **one load a day**. The day resets at midnight UK time.
- A shipper plan lifts posting (Starter 25 a month, Growth 100, Fleet
  unlimited).
- A Driver plan lifts pick-ups: Driver New to 20 a month, Driver Fleet to
  60 a month, Driver Pro to unlimited.
- A Dual Operator (a company that both ships and carries): while **Dual Operator
  accounts** is off under Admin → Features (the default), it is offered the
  shipper and Driver plans like anyone else. Switch it on and it is offered
  one plan only, Dual Operator Unlimited, which lifts both; the same
  rule applies when you give it a plan free. Paste that plan's link first.
- Jobs already accepted carry on regardless.

To give a pilot customer a plan without payment, open their company page →
Plan, choose the plan and how long (7, 14 or 30 days, or no end date), then
"Give plan free". When it runs out, the company falls back to whatever it
pays for, or to its trial or free.

## Going live

Repeat steps 2–5 with `sk_live_…`. That means a new webhook endpoint in live
mode with a new secret: replace `STRIPE_WEBHOOK_SECRET` with the live one,
then paste the live links over the test ones.
