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

Step 5a (job lifecycle + the atomic legal event):
- domain: JobEvidence + validateDeliveryEvidence (PoD needs photo +
  signature + recipient). paths: evidence docs. Actions: collectJob,
  startTransit (plain status+event), deliverJob (PoD evidence + delivered
  status + event in ONE batch). Rules cover jobs/*/evidence. Seed walks the
  full lifecycle and prints the PoD.

Step 5b (offline sync-queue engine — @mbh/offline, a pure zero-dep layer):
- Ports: QueueStorage + DispatchTransport (interfaces; in-memory test
  doubles in testing.ts). SyncQueue: enqueue (offline capture; idempotent
  on requestId; refuses non-idempotent action types via an injected
  allow-list), pendingCount (the "waiting for signal" badge), drain
  (queued → deliver; retry keeps it queued, permanent 4xx → failed and
  auto-retry stops; resends the SAME requestId so the server dedupes).
  Honest states: queued / sending / failed. 11 tests. A real double-count
  bug in attempts was caught by the test and fixed.

Step 5c (browser providers): @mbh/provider-http (HttpDispatchTransport,
Zod-parsed responses, retry-by-default so a capture is never lost) and
@mbh/provider-indexeddb (IndexedDbQueueStorage via idb, durable across
reloads). Tested with fake fetch + fake-indexeddb.

Step 5d (the web layer — bootstrap step 5 complete):
- @mbh/client (pure): buildDeliverRequest (same domain PoD validation at
  capture time) + genRequestId (stable idempotency key). Tested.
- apps/web: Astro static output + one React island. Landing is pure Astro
  (zero JS); the driver app is the island at /app. PWA: hand-written
  service worker (network-first navigations, versioned mbh-shell-v1 cache,
  /api/* never cached), manifest.webmanifest, SVG icon, Barlow +
  Barlow Condensed fonts.
- The 30-second moment: MarkDelivered captures photos + signature (canvas
  pad) + recipient, buildDeliverRequest validates inline (red-star required
  fields), and onCommit enqueues via the real SyncQueue wired to the
  IndexedDB + HTTP providers at the composition root (apps/web/src/lib/
  queue.ts). Honest offline UX: a badge counts what's queued, rows show
  "Waiting for signal…", drains on mount / online event / 15s interval.
- Verified in a real browser (Playwright): filling the form and tapping
  Record delivery persists a deliverJob to IndexedDB (status queued) and
  shows the "saved to this device, sent automatically when you have signal"
  confirmation; the only network error is the expected /api/dispatch 404
  (no backend yet), which correctly keeps the item queued.
- Since there is no auth/backend yet, the active job is read from URL
  params purely for demo (?job=&carrier=); without them the app shows an
  honest "No active job" empty state. The token is null so drains retry —
  honest offline behaviour, not a bug.
- CI gains `pnpm check:web` (astro check — 0 errors) and `pnpm build`
  (astro build). Root eslint ignores apps/web/.astro generated files.

Full unit suite: 75 tests green; rules: 14 green; astro check 0 errors;
build green; typecheck, lint, seed green. Bootstrap steps 1–5 complete.

## Next step

Bootstrap step 6 — the real cloud: create the Firebase/GCP project +
billing (FOUNDER action, out of chat), then the FirestoreDataStore behind
the SAME contract suite (test:contract on the emulator), the two gen2
functions (dispatch + 1-minute drain), Terraform env (budget alert, uptime
probe), keyless WIF deploy job, and smoke:prod. This is the first slice
that needs a cloud account and the first that can cost money — nothing
before it does. The dispatch function makes the /api/dispatch the offline
queue already posts to real, closing the loop end to end.

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
