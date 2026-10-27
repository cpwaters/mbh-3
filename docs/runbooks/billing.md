# Runbook: switching on subscriptions

Billing ships dormant. Until the steps below are done, every shipper can post
as many loads as they like, the Billing page says that plans are not enforced
yet, and the webhook answers 503 to everything. Do it in **test mode** first,
then repeat with the live key.

Secrets in this runbook (your Stripe secret key and the webhook signing
secret) go only where it says: your own shell and GitHub's secret store.
Never put them in a chat, an issue, a commit or a file in the repo.

## 1. Set the prices (optional)

The provisioning script creates these monthly GBP prices unless told
otherwise: Starter £49, Growth £129, Fleet £299 for shippers, and Driver
£9.99 for drivers. **They are placeholders.** To use your own, set them in
pence when you run step 2:

    STARTER_PENCE=3900 GROWTH_PENCE=9900 FLEET_PENCE=24900 DRIVER_PENCE=799

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

In /app/admin → Billing, paste the four payment links (three shipper plans
and the Driver plan) and the portal link the script printed, along with the
monthly prices to display. Save, leaving "Enforce plans" off.

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
- Every company is free for 14 days from sign-up. Companies created before
  trials existed count 14 days from when they were created, so most will
  already be past it. Give any you want to keep a plan first (below).
- After the trial, a shipper past its monthly allowance (Free 3, Starter 25,
  Growth 100, Fleet unlimited) is told to upgrade when it posts.
- After the trial, a driver needs the Driver plan to accept loads. Jobs
  already accepted carry on regardless.

To give a pilot customer a plan without payment, open their company page →
Plan, choose the plan and how long (7, 14 or 30 days, or no end date), then
"Give plan free". When it runs out, the company falls back to whatever it
pays for, or to its trial or free.

## Going live

Repeat steps 2–5 with `sk_live_…`. That means a new webhook endpoint in live
mode with a new secret: replace `STRIPE_WEBHOOK_SECRET` with the live one,
then paste the live links over the test ones.
