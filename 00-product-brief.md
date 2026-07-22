# MyBackHaul — Product Brief (v1, founder-confirmed)

**One-liner:** A UK haulage marketplace that fills empty return legs —
distributors post loads, drivers with spare capacity accept them — with the
delivery record, not the listing, as the product's legal core.

## 1. Who pays

Distributors (shippers) pay; drivers ride free. Subscription tiers via
Stripe (Starter / Growth / Fleet), tier derived from the Price id. No
per-load commission in v1 — holding money in the flow drags in
payment-institution compliance we don't want yet. A driver-side premium
tier is a later option, not architecture.

## 2. What job it does

- **Distributor:** post a load (source/destination, consignment details,
  vehicle requirements, dates, price) → watch it get accepted → track the
  vehicle live → receive proof of delivery → close and pay the carrier
  off-platform (v1).
- **Driver/carrier:** browse loads matching an empty return leg → accept
  (one active job at a time) → navigate (native map handoff) → capture
  collection and delivery evidence offline → build an earnings and
  compliance history.
- Vocabulary: loads, backhauls, consignments, PoD, O-licence, artic/rigid.

## 3. Legally required records (the append-only set)

- **Proof of delivery** — photo(s), signature, timestamp, GPS position,
  recipient name. Evidence + the delivered status change commit in one
  atomic batch (the product's "atomic legal event").
- **Consignment record** — what was carried, for whom, by whom, in which
  vehicle. Created at acceptance, immutable; corrections are new records.
- **Drivers' hours & working time** — kept as a compliance record
  (UK/EU drivers' hours rules), retained ≥ 2 years.
- **Status/audit trail** — every state transition attributed; members
  disabled, never deleted.
- **Retention:** PoDs and consignment records 6 years; drivers' hours
  2 years. No government API in v1; the drain's first outbound legs are
  marketplace notifications and PoD delivery to the distributor.

## 4. The 30-second moment

A driver in a yard with no signal marks a delivery: open job → tap
Delivered → photo of the pallets → recipient signs on the shared tablet →
done. Capture succeeds instantly against the offline queue, shows
"waiting for signal…" honestly, and delivers atomically on reconnect.

## 5. Tenant & role model

- Tenant = a company, with capabilities `shipper`, `carrier`, or both
  (owner-drivers are one-person carrier tenants).
- Loads live under the shipper tenant. Acceptance creates a cross-tenant
  **Job** record — the shared, append-only object both parties read, where
  PoD and status live. Marketplace browse reads a public listing
  projection, never the shipper's private data.
- Roles per tenant: `owner`, `dispatcher`, `driver`.

## 6. External providers (each behind an interface, mock-first)

postcodes.io (geocoding) · OSRM (routing) · What3Words (API plan needs
fixing) · native map handoff · Stripe · Firebase (DataStore contract).
Labs scripts re-validate each before adapters are written.

## 7. Logistics

- Repo: cpwaters/mbh-3, local at ~/Projects/MyHaul/mbh-3. Fresh Firebase
  project at bootstrap step 6; migrate the handful of real accounts from
  the prototype by script at cutover. The mbh prototype stays live as
  demo until parity.
- One web app (single Astro site, one React island) with role-based
  navigation — replaces the prototype's separate client/distributor apps.
