# HANDOFF

## Current state

Bootstrap steps 1–2 of docs/reference/architecture.md §11 are complete:

- pnpm workspace, TypeScript strict + project references (tsc -b), eslint
  flat config with layer-boundary rules as errors, vitest, CI validate
  workflow (typecheck → lint → test → seed).
- `@mbh/domain`: Tenant/Member/Load/Job/JobEvent entities, load + job
  state machines, ACTIVE_JOB_STATUSES (one-active-job-per-driver), money
  invariants (integer GBP pence, bounded). Unit-tested.
- `@mbh/provider-interfaces`: the DataStore contract (batch atomicity,
  shallow-merge update semantics, direct-children queries, serialized
  transactions with CAS) + the reusable contract test suite.
- `@mbh/provider-mocks`: InMemoryDataStore passing the full contract suite.
- `scripts/seed.ts`: walking skeleton — tenants + member + load, atomic
  CAS acceptance creating the cross-tenant Job + first append-only event,
  second claim refused. Runs in CI.
- Docs: CLAUDE.md (invariants), 00-product-brief.md (founder-confirmed),
  docs/reference/architecture.md (the printing press), ADR-0001.

## Next step

docs/backlog/0001-action-layer.md — bootstrap step 3 (dispatch pipeline,
requireMember, audit ops, idempotency markers, paths module, postLoad +
acceptLoad). A fresh session can start it cold.

## Known deferred items

- Firebase project, Terraform env, WIF deploy job: bootstrap step 6 —
  needs the founder to create the GCP/Firebase project + billing.
- What3Words API plan is broken on the prototype (QuotaExceeded on
  convert-to-3wa) — resolve before the W3W provider is built here.
- Prototype (cpwaters/mbh-2) stays live as demo; account migration script
  happens at cutover.
