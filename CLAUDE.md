# MyBackHaul (mbh-3) — Invariants

This is the project instance of the printing-press architecture
(docs/reference/architecture.md — read it before changing structure).
The product brief is 00-product-brief.md. Current state and next steps:
docs/HANDOFF.md. If code and this file disagree, fix whichever is wrong.

## What this is

A UK haulage backhaul marketplace: shipper tenants post loads; carrier
tenants accept them. Acceptance creates a cross-tenant, append-only Job
record where evidence and status live. The proof-of-delivery capture —
offline, in a yard with no signal — is the product's core moment.

## Non-negotiables (inherited, do not relitigate)

1. The record of record is server-side and append-only. Corrections are new
   records. Evidence and the status change it justifies commit in ONE
   atomic batch.
2. One mutation path: the Action Layer. No UI component, scheduled job, or
   webhook writes business documents directly. All client mutations go
   through POST /api/dispatch.
3. Offline-first is architecture. Capture succeeds with zero signal;
   delivery is retried, idempotent, honest about its state.
4. Vendors are replaceable implementations behind interfaces. Each vendor
   SDK lives in exactly one providers/<vendor> package. CI runs on the
   in-memory mocks by default; the contract suite proves mock/real
   equivalence.
5. Zero-to-low idle cost. Static hosting + exactly two gen2 functions
   (dispatch + 1-minute drain), europe-west2.
6. Third-party calls never happen synchronously in a user request; outbound
   work goes through the drain (CAS claim, backoff, system-sourced outcome
   records).
7. Infrastructure is Terraform; deploys go through CI on green (keyless
   WIF). Hand-deploys are emergency-only.

## Domain (packages/domain — zero deps)

- Tenant = a company; capabilities: shipper, carrier, or both. Roles:
  owner, dispatcher, driver. Members are disabled, never deleted.
- Load (shipper-owned listing): available → matched | cancelled;
  matched → fulfilled | available (re-list correction). Terminal:
  cancelled, fulfilled.
- Job (cross-tenant record): accepted → collected → in_transit →
  delivered → closed. One active job per driver
  (ACTIVE_JOB_STATUSES).
- JobEvents are append-only. Money is integer GBP pence, positive, bounded
  (MAX_LOAD_PRICE_GBP_PENCE). Timestamps are ISO-8601 UTC strings.

## Layering (lint-enforced)

domain / offline / auth / actions / provider interfaces / mocks must not
import vendor SDKs, React, or browser APIs (eslint no-restricted-imports —
keep the globs current as packages land). Providers are injected at the
composition root.

## Commands

- pnpm typecheck — tsc -b (emits dist)
- pnpm lint — eslint (layer boundaries are errors)
- pnpm test — vitest, Firebase-free, mocks only; includes the DataStore
  contract suite against InMemoryDataStore
- pnpm seed — walking skeleton (domain + store + atomic CAS claim)
- Later (as layers land): test:rules, test:contract, test:e2e, smoke:prod,
  docs:shots

## Working style

Small increments: green → commit + push (CI validates) → next slice.
Every feature answers before build: human path, which Action, permissions,
audit event, provider interfaces, offline safety, idle cost. Secrets never
transit chat and never enter the repo. UI copy speaks the trade's
vocabulary (loads, backhauls, PoD, artic/rigid), not database nouns.
