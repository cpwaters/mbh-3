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

Step 6a (real DataStore provider — proven equivalent to the mock):
- @mbh/provider-firestore: FirestoreDataStore (Admin SDK; the only package
  importing firebase-admin). Transaction writes are buffered and flushed
  after the callback so all reads precede all writes (Firestore's rule)
  while the callback reads-then-writes naturally; the buffer is per-attempt
  so retry-on-contention re-runs cleanly. gRPC errors mapped to the
  contract's codes (ALREADY_EXISTS→already-exists, NOT_FOUND→not-found).
- pnpm test:contract runs the SAME DataStore contract suite against real
  Firestore on the emulator — all 13 pass, identical to the mock. This is
  the proof that mock-first CI is faithful to production. Wired into CI.

Step 6b (the HTTP dispatch boundary + the two functions):
- @mbh/actions gains handleHttpRequest — the exact logic the dispatch
  function runs, as a pure function of an HTTP-ish request (method, path,
  Authorization header, body). Routes /health (no auth) and POST
  /api/dispatch (authenticateActor from the bearer token → the action
  registry). Maps AppError codes to HTTP status (401/403/404/400/409/500)
  and returns the SAME { ok:true, result } | { ok:false, error } shape the
  HttpDispatchTransport already parses — the loop is closed at the logic
  level. Never leaks internal error detail. 9 tests against the mocks.
- functions/: exactly two gen2 functions (europe-west2). dispatch — a thin
  onRequest adapter over handleHttpRequest. drain — a 1-minute
  onSchedule claim/backoff/record SKELETON (no-op until the first outbound
  work type exists). composition.ts wires FirestoreDataStore +
  FirebaseAuthProvider (getAuth().verifyIdToken) + the registry, cached
  across warm invocations. Built + typechecked (in tsc -b); the boundary
  logic they wrap is fully unit-tested.

Full unit suite: 84 green; contract: 13 green (emulator); rules: 14 green;
astro check 0 errors; build, typecheck, lint, seed green.

Step 6c (go-live plumbing — all code/config done + emulator-proven):
- Project: mybackhaul-app (fresh). .firebaserc targets it; firebase.json at
  the repo root (firestore rules/indexes in firebase/, functions with an
  esbuild-bundle predeploy, hosting apps/web/dist with /api/** + /health
  rewrites to dispatch, emulators). Rules/contract scripts use the root
  config now.
- Functions deploy bundle: esbuild bundles src → dist/index.cjs (workspace
  deps + zod inlined; firebase-admin/functions external) so pnpm-workspace
  functions deploy cleanly; functions typechecked separately (noEmit, out of
  the composite graph).
- test:functions — the loop-closing integration test: builds functions, runs
  them in the emulator (functions+firestore+auth), mints a REAL Firebase
  token, POSTs to /api/dispatch through the real dispatch function, and
  asserts a real Firestore job is created (+ /health, 401 fail-closed,
  idempotent replay). 4 tests green. Wired into CI.
- Terraform (infrastructure/environments/production): budget alert
  (50/90/100%), uptime check on /health, keyless WIF pool/provider pinned to
  cpwaters/mbh-3, deploy service account + roles. terraform fmt + validate
  clean.
- CI deploy job: needs validate; main + push only; gated on the
  PRODUCTION_DEPLOY repo variable; keyless WIF auth; firebase deploy
  functions+hosting+firestore; then smoke:prod (scripts/smoke-prod.ts:
  /health 200, unauthenticated /api/dispatch 401 fail-closed, pages 200).

Full suite: 84 unit + 13 contract + 14 rules + 4 functions-integration green;
typecheck (root + functions), lint, build, seed green; terraform validate
clean.

## FOUNDER ACTION NEEDED — cloud provisioning + first deploy

All code/config is done and emulator-proven; the remaining steps need the
founder's cloud credentials (CLI auth was expired this session). Exact
commands are in docs/runbooks/go-live.md: re-auth gcloud/firebase, enable
APIs, create the Firestore db in europe-west2, `terraform apply` (WIF +
budget + uptime), set three GitHub repo variables (WIF_PROVIDER,
DEPLOY_SERVICE_ACCOUNT, PRODUCTION_DEPLOY=true), then push to main — CI
deploys keylessly and runs smoke:prod. No secrets transit chat.

## Next step

After the go-live runbook + first green deploy: step 7 (external
integrations — labs scripts against live APIs, adapters behind interfaces,
the drain's first outbound leg) and/or step 8 (E2E browser journeys, docs).
Migrate the prototype's real accounts by script at cutover.

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
