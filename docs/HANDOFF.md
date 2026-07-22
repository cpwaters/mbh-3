# HANDOFF

## Current state

Bootstrap steps 1–3 of docs/reference/architecture.md §11 are complete.

Steps 1–2 (foundation):
- pnpm workspace, TypeScript strict + project references (tsc -b), eslint
  flat config with layer-boundary rules as errors, vitest, CI validate
  workflow (typecheck → lint → test → seed).
- `@mbh/domain`: entities, load + job state machines, ACTIVE_JOB_STATUSES,
  money invariants, structured AppError.
- `@mbh/provider-interfaces`: DataStore contract (batches, updates,
  queries, serialized transactions with CAS + in-transaction query) and
  AuthProvider contract + the reusable DataStore contract suite.
- `@mbh/provider-mocks`: InMemoryDataStore (passes the contract suite) and
  MockAuthProvider (scriptable token → actor).

Step 3 (Action Layer — the one mutation path):
- `@mbh/paths`: the single source of document/collection paths; a test
  pins that no literal collection paths exist in the pure layers.
- `@mbh/auth`: authenticateActor — resolves the actor from a verified
  token at the boundary (never from the payload).
- `@mbh/actions`: dispatch pipeline (validate → authorize → effect + audit
  + idempotency marker, all in ONE transaction), requireMember, buildAuditOp,
  Zod parse adapter, action registry with a pinned idempotent-action set.
  Actions: postLoad (shipper; owner|dispatcher) and acceptLoad (carrier;
  owner|driver — CAS the load, create cross-tenant Job + first event,
  enforce one-active-job-per-driver in the tx). 13 pipeline tests cover
  happy paths, bad payloads, wrong role, disabled member, CAS conflict,
  idempotent replay, cross-action requestId refusal, one-active-job.
- `scripts/seed.ts` rewritten to authenticate + dispatch the real actions.

Step 4 (security rules — defence in depth):
- firebase/firestore.rules: deny-by-default; tenants + members readable by
  active members of the same tenant; loads readable only by the owning
  shipper's members (raw loads are shipper-private; carriers will read a
  public listing projection — a separate collection, not yet built); jobs +
  their append-only events readable by active members of EITHER side; audit
  and idempotency markers never client-readable; ALL client writes denied.
- firebase/firestore.indexes.json: empty — current queries are single-field
  equality (auto-indexed). A composite index goes here when the drain adds
  an ordered+filtered query.
- firebase/rules-tests: 14 tests via @firebase/rules-unit-testing against
  the emulator, explicit allow AND deny per collection. Run with
  `pnpm test:rules` (firebase emulators:exec wraps vitest). Wired into CI
  (adds a JDK + the emulator to the validate job).

Full unit suite: 40 tests green; rules: 14 green; typecheck, lint, seed
all green.

## Next step

docs/backlog/0003-offline-queue-and-first-screen.md — bootstrap step 5
(pure offline sync-queue engine, the Astro + React-island PWA shell, and
the driver's offline "Mark Delivered" capture — the 30-second moment, with
the new deliverJob action committing evidence + status in one batch). This
is the first slice with a browser bundle. Startable cold.

## Known deferred items

- Firebase project, Terraform env, WIF deploy job: bootstrap step 6 —
  needs the founder to create the GCP/Firebase project + billing.
- Idempotency under real Firestore contention: the mock serializes
  transactions so a concurrent duplicate sees the marker directly; on
  Firestore, the create-marker-already-exists triggers a transaction retry
  that then hits the replay path. Same observable outcome, different
  mechanism — re-verify when the real provider lands (step 6).
- What3Words API plan is broken on the prototype (QuotaExceeded on
  convert-to-3wa) — resolve before the W3W provider is built here.
- Prototype (cpwaters/mbh-2) stays live as demo; account migration script
  happens at cutover.
