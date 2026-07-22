# ADR-0001: Inherit the printing-press architecture; rebuild rather than retrofit

## Status

Accepted.

## Context

The mbh prototype (cpwaters/mbh-2) proved the product's flows — load
lifecycle, one-active-job-per-driver, live tracking, mobile-first UI — but
violates the target architecture structurally: all mutations are
client-side Firestore writes, there is no audit trail, no offline queue,
no tests in the repo, no CI, and deploys were by hand. The printing-press
architecture (docs/reference/architecture.md) was supplied as the
non-negotiable target.

## Decision

- Build MyBackHaul v1 as a greenfield repo (cpwaters/mbh-3) following the
  printing press wholesale, in its bootstrap order.
- Keep the mbh prototype live as the demo/spec until parity; port UI
  patterns as React islands; migrate the handful of real accounts by
  script at cutover.
- Product decisions are recorded in 00-product-brief.md (founder-confirmed):
  shippers pay / drivers free; drivers' hours kept as a compliance record;
  no government API in v1; tenant = company with shipper/carrier
  capabilities and acceptance creating a cross-tenant Job record; one web
  app with role-based navigation instead of the prototype's two apps.

## Consequences

- A strangler migration of the prototype is explicitly rejected: with no
  test net and every file violating the layering, a retrofit costs more
  than a rebuild while risking the working demo.
- Every non-domain decision (stack, layering, patterns, CI, security
  model) is inherited from the reference doc and is not relitigated in
  future ADRs — only domain-specific decisions get new ADRs.
