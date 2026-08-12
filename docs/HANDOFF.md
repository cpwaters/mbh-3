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

## GO-LIVE COMPLETE — LIVE in production

The first production deploy is green. https://mybackhaul-app.web.app is
serving: landing 200, /app PWA 200, /health 200 via the hosting rewrite to
the gen2 `dispatch` function (europe-west2) → Firestore, unauthenticated
/api/dispatch 401 (fail-closed), firestore rules released, `drain` scheduled.
CI deploys keylessly via WIF on green; `smoke:prod` passes in the deploy job.

Infra provisioned via Terraform (WIF, deploy SA + least-priv roles incl.
firebaseextensions.editor, budget, uptime). The go-live surfaced several
cloud steps now captured in docs/runbooks/go-live.md: enable the full API set
up front (the least-priv deploy SA can't), set ADC quota project for the
budget apply, npm-clean functions manifest for the buildpack, region-pinned
hosting rewrites, and a one-time `allUsers` run.invoker grant on `dispatch`
(the last blocker — hosting 404s until the public function is invocable).

## Step 7 (external integrations — first outbound leg: load enrichment)

Built the architecture's way — labs → adapter-behind-interface → drain leg,
mock-first in CI, no third-party call anywhere in the request path.

Step 7a (geocoding + routing behind interfaces):
- domain: GeoPoint, RouteInfo, LoadRoute; Load gains optional `route` (integer
  metres/seconds). provider-interfaces: Geocoder + RouteProvider, each with a
  recoverable-flagged structured error.
- @mbh/wire: external wire schemas + the ONE mapper each (postcodes.io lookup,
  OSRM route); a well-formed not-found/no-route maps to null, only an
  unparseable body errors.
- provider-mocks: InMemoryGeocoder (scriptable) + InMemoryRouteProvider
  (deterministic haversine, scripted overrides), both with failOnce().
- provider-postcodes-io + provider-osrm: thin fetch adapters (transport + error
  classification; mapping lives in wire). Tested with a fake fetch.
- labs/: by-hand live-API drift-check scripts; a workspace package so tsc -b
  typechecks them, never run in CI.

Step 7b (the drain's first outbound leg):
- domain: OutboxTask (pending/claimed/done/failed, attempts, MAX 5). paths:
  outbox collection. postLoad now enqueues an enrichLoadRoute task atomically
  with the load.
- @mbh/actions runDrainOnce: reclaim stale claims → query pending → CAS-claim +
  read load → geocode both postcodes + route → record (load.route + task done +
  source:'system' audit) in ONE transaction. Unknown postcode / no route =
  permanent fail; recoverable provider error retries (attempt-capped, the
  1-minute schedule is the backoff). Pure — runs on mocks in CI, Firestore +
  real adapters in prod.
- functions/drain.ts wires runDrainOnce with FirestoreDataStore +
  PostcodesIoGeocoder + OsrmRouteProvider. Rules: outbox never client-readable/
  writable (+ deny tests). seed shows the enrichment end to end.

Full suite: 113 unit + 13 contract + 16 rules + 4 functions-integration green;
typecheck, lint, build, check:web, seed all green.

## Step 8 (E2E regression net + the footgun lint rule)

Step 8a (E2E browser journeys): @mbh/e2e — Playwright against the real
production bundle (astro preview serves it), selectors user-visible text only.
Four journeys: landing→app nav, the no-active-job empty state, the full
30-second moment (photo + drawn signature + recipient → "Delivery recorded" +
queued), and the required-proof guard. The core flow is offline-first so it
needs no backend — the E2E covers the browser DOM/React behaviour the
HTTP-level functions-integration test can't see. Wired into CI validate
(installs chromium, runs after build); `pnpm test:e2e` runs it locally.

Step 8b (footgun lint): react-hooks/rules-of-hooks is now an ERROR on
apps/web (a hook after a conditional early return blanks the screen yet
typechecks). A canary (tooling/lint-canary.test.ts) lints inline good/bad
snippets through the real eslint config and asserts the rule actually
fires — so a silent regression of the wiring fails the suite.

Full suite: 115 unit + 13 contract + 16 rules + 4 functions-integration +
4 E2E green; typecheck, lint, build, check:web, seed all green.

## Carrier listing projection (ADR-0002 — built)

Raw loads stay shipper-private; carriers browse a deliberately-narrow, safe
`listings/{loadId}` projection (route as town+postcode, goods summary, window,
headline price — never line1 or commercial internals).
- domain: Listing + listingFromLoad (the ONE projection mapper). paths:
  listings collection. postLoad writes the listing atomically with the load;
  acceptLoad deletes it (taken loads leave the browse); the drain mirrors the
  computed route onto the listing when it still exists.
- rules: any signed-in user may read listings, server-only writes (+ allow/deny
  tests). seed prints the live listing and its removal on accept.

Full suite: 119 unit + 13 contract + 19 rules + 4 functions-integration +
4 E2E green; typecheck, lint, build, check:web, seed all green.

## Sign-in (email/password + Google — built, mock-first)

The keystone slice: the app now authenticates, and every dispatch carries a
real ID token.
- provider-interfaces: AuthClient (signInWithPassword, signInWithGoogle,
  signOut, getIdToken, currentSession, subscribe) + AuthSession +
  AuthClientError. provider-mocks: MockAuthClient (scriptable, CI default).
- provider-firebase-auth-web: the ONLY firebase-auth-SDK importer, behind the
  interface (email/password + GoogleAuthProvider popup + onIdTokenChanged +
  connectAuthEmulator). A Firebase web app is registered; its PUBLIC config is
  baked into the bundle (apps/web/src/lib/auth.ts), projectId env-overridable.
- apps/web: useAuth hook, SignIn screen (email/password + Continue with
  Google), DriverApp gated on the session; useSyncQueue now gets the real
  getIdToken so drains are authenticated.
- E2E is now the FULL emulator stack (auth+firestore+functions+hosting):
  scripts/run-e2e.sh builds the emulator bundle (PUBLIC_USE_EMULATORS=true,
  PUBLIC_FIREBASE_PROJECT_ID=demo-mbh), seeds an auth user + in-transit job via
  admin, signs in through the UI, captures a PoD, and asserts the job reaches
  `delivered` in Firestore through the real dispatch function — then ALWAYS
  restores the prod bundle so a deploy can't ship the emulator flavour.

Full suite: 123 unit + 13 contract + 19 rules + 4 functions-integration +
4 full-loop E2E green; typecheck, lint, build (prod + emulator), check:web,
seed all green.

**FOUNDER STEP for production sign-in:** enable the sign-in providers in the
Firebase console (Authentication → Sign-in method): **Email/Password** and
**Google**. For Google, configure the OAuth consent screen and add
`mybackhaul-app.web.app` (+ `mybackhaul-app.firebaseapp.com`) as an authorized
domain. The code + E2E prove correctness against the emulator; providers are
just not enabled on the live project yet.

## Driver home — reads the active job from Firestore (built)

The driver app reads the signed-in driver's current job directly from Firestore
(rules-gated) instead of URL params.
- domain: Job now carries origin/destination (+ optional route), denormalized
  from the load by acceptLoad. provider-interfaces: JobReader; provider-mocks:
  MockJobReader. rules: a driver may read jobs where they are the driver — a
  direct field match placed FIRST so it also authorizes the driver-home list
  query `where driverActorId == uid`.
- provider-firestore-web: the ONLY Firestore web SDK importer, behind
  JobReader. apps/web: shared firebase-config, getJobReader, useActiveJob,
  DriverApp renders loading / no-active-job / capture from the read.
- E2E exercises the real read: seeds the job WITH delivery details + a jobless
  user; 5 journeys incl. the empty state, the job read from Firestore (shows
  Trafford → Leith, no URL params), the required-proof guard, and the full loop
  to `delivered`.

Full suite: 126 unit + 13 contract + 21 rules + 4 functions-integration +
5 full-loop E2E green; typecheck, lint, prod+emulator builds, check:web, seed.
CI actions bumped to Node-24 majors (checkout@v7, setup-node@v7, setup-java@v5,
pnpm/action-setup@v6, auth@v3).

## Carrier browse screen (built)

The marketplace's other side: a signed-in carrier browses available loads and
accepts one, which becomes their active job.
- provider-interfaces: ListingReader + MembershipReader; provider-mocks +
  a consolidated FirestoreReader (JobReader + ListingReader + MembershipReader,
  one emulator connection). rules: a user reads their OWN member docs across
  tenants (field-aligned collection-group query) so the app can resolve the
  carrier tenant id.
- app: useCarrierBrowse (resolves the carrier tenant + reads listings),
  AvailableLoads (each load with an Accept button), lib/dispatch (a one-shot
  ONLINE dispatch for accept — needs an immediate got-it/taken answer, distinct
  from the offline queue). DriverApp: no active job -> the browse; accept ->
  re-read the active job -> the delivery capture.
- E2E: a carrier signs in, browses (Avonmouth -> Cardiff read from Firestore),
  accepts, and the home switches to Mark delivered. 5 journeys green.

Full suite: 128 unit + 13 contract + 23 rules + 4 functions-integration +
5 full-loop E2E green; typecheck, lint, prod+emulator builds, check:web, seed.

Simplification to revisit: the browse uses the FIRST membership as the carrier
tenant (single-tenant assumption); multi-tenant selection + capability
filtering is a later refinement.

## Shipper post-a-load UI (built) — the whole loop is now UI-driven

- Memberships now carry tenant capabilities (FirestoreReader reads each
  tenant), so the app knows which tenant is a shipper vs carrier.
- app: useMemberships (derives shipperTenantId + carrierTenantId), useListings
  (carrier browse), PostLoad form (dispatches postLoad online). DriverApp is
  capability-aware: a shipper sees "Post a load"; a carrier sees their active
  delivery or the browse; a user with both sees both.
- E2E: a shipper signs in, fills the form, posts a load, sees "Load posted"
  (the load then appears in the carrier browse). 6 journeys green — the full
  marketplace loop is UI-driven: shipper posts -> carrier browses + accepts ->
  driver captures PoD offline -> delivered.

Full suite: 128 unit + 13 contract + 23 rules + 4 functions-integration +
6 full-loop E2E green; typecheck, lint, prod+emulator builds, check:web, seed.

## Server-side capability enforcement (built)

requireTenantCapability(tx, tenantId, capability) reads the tenant and refuses
the action if the capability is absent — enforced in the SAME transaction as
the role check. postLoad requires 'shipper'; acceptLoad requires 'carrier'. So
role alone (a carrier tenant's owner) can never post loads, and a shipper's
driver can never accept — the client's capability-aware UI is convenience, this
is the invariant. Tests cover both refusals + the still-allowed happy paths.

Full suite: 131 unit + 13 contract + 23 rules + 4 functions-integration +
6 full-loop E2E green.

## Multi-tenant UI selection (built)

A user who belongs to several tenants picks which to "act as"; the selected
tenant's capabilities drive the view.
- Membership now carries the tenant name (FirestoreReader reads it). useTenants
  resolves all memberships + a localStorage-persisted selection (falls back to
  the first tenant if the stored one isn't a membership). TenantSwitcher renders
  a picker only when there is more than one tenant.
- DriverApp: the selected tenant decides the sections — shipper -> Post a load;
  carrier -> active delivery or browse; a both-capability tenant shows both.
  Accept/post are scoped to the selected tenant id.
- E2E: a user in a shipper + a carrier tenant switches and the view changes
  (Post a load <-> the carrier browse). 7 journeys green.

Full suite: 131 unit + 13 contract + 23 rules + 4 functions-integration +
7 full-loop E2E green.

## User docs + screenshots (built)

Public /guide pages (pure Astro, zero JS, part of the deployed site, linked
from the landing) explaining sign-in + the shipper/carrier/driver flows and the
offline story. Screenshots are captured from the REAL app against the emulator
stack: `pnpm docs:screenshots` (scripts/capture-screenshots.sh + a Playwright
screenshots.config) writes PNGs into apps/web/public/guide/ (committed); the
guide embeds them. NOT part of CI (no binary churn) — regenerate when the UI
changes. An E2E journey asserts the guide page + link work.

Full suite: 131 unit + 13 contract + 23 rules + 4 functions-integration +
8 full-loop E2E green; typecheck, lint, check:web, prod+emulator builds pass.

## Self-hosted OSRM (config + infra-as-code; founder runs the deploy)

The drain's OSRM endpoint is now configurable: functions/src/composition.ts
reads OSRM_BASE_URL (env), defaulting to the public demo server. CI writes
functions/.env from a GitHub `OSRM_BASE_URL` variable at deploy, so swapping to
a self-hosted OSRM is config, not code. infrastructure/osrm/ has a Dockerfile
(GB graph baked in), cloudbuild.yaml (heavy build on a 32-vCPU machine), and
Terraform for a scale-to-zero Cloud Run service (public + max_instances-bounded
for now; private-with-token is a documented follow-up). docs/runbooks/osrm.md
walks the founder through the build + deploy (heavy/costly, so founder-run).
Verified: composition change loads cleanly (test:functions 4/4), terraform
validate clean.

## Invoice email on delivery (config + infra-as-code; founder provisions SMTP)

Once deliverJob commits (PoD evidence + delivered status + event), it
atomically enqueues a `sendInvoiceEmail` outbox task (a second OutboxTaskType
alongside `enrichLoadRoute` — the same claim/retry/settle drain machinery,
extended, not duplicated). The drain builds the invoice from the job + both
tenants' own records — carrier/shipper company names from Tenant.name, the
recipient email from the shipper tenant owner's (falling back to a
dispatcher's) own UserProfile.email, the carrier's VAT number from their
owner's profile if set (best-effort — its absence never fails the invoice) —
and sends it via a new Mailer provider interface
(packages/providers/interfaces/src/mailer.ts), implemented by
`@mbh/provider-nodemailer` (nodemailer over SMTP + pdfkit for the PDF
attachment; CI runs on the in-memory mock, `InMemoryMailer`). A styled HTML
email + a matching one-page PDF, both rendered from the same InvoiceData (see
packages/domain/src/invoice.ts) so they can't drift apart. Records the send as
an append-only `job.invoiceSent` JobEvent + a system audit entry, same pattern
as `enrichLoadRoute`.

SMTP auth is read as a plain env var (functions/.env, written at deploy from
a GitHub Actions repository SECRET — encrypted, never committed, never in
chat), the same delivery mechanism as the non-secret SMTP_HOST/PORT/FROM,
just via the `secrets.` context instead of `vars.`. This is a deliberate
stopgap, not the intended end state — see the incident below for why.

**INCIDENT (self-inflicted, caught same-day, two rounds):**

*Round 1:* the first version of this change used firebase-functions'
`defineSecret()` + declared `secrets: [smtpUser, smtpPassword]` on the drain
function's config. Firebase resolves a function's declared secrets against
Secret Manager AT DEPLOY TIME — since neither the secrets nor the Secret
Manager API existed yet on the project, the deploy failed outright with
`Secret Manager API has not been used in project mybackhaul-app...`, and
because functions/hosting/firestore deploy as one command, NOTHING deployed
(hosting and firestore rules included) until fixed.

*Round 1's fix, and why it wasn't enough:* removed `secrets: [...]` from the
function config, expecting that to stop Firebase from checking Secret
Manager. It didn't — the deploy failed with the EXACT SAME error. Turns out
firebase-functions' parameterized-config system resolves EVERY `defineSecret()`
call found anywhere in the deployed bundle during deploy analysis,
independent of whether any specific function's `secrets: [...]` references
it — merely calling `defineSecret('SMTP_USER')` in a module that gets
bundled in is enough to trigger the Secret Manager lookup for the whole
deploy.

*Round 2's fix (current state):* stopped calling `defineSecret()` at all —
deleted functions/src/secrets.ts, and composition.ts now reads
`process.env.SMTP_USER`/`SMTP_PASSWORD` directly, exactly like
SMTP_HOST/PORT/FROM already do, sourced from a GitHub Actions repository
SECRET (`.github/workflows/ci.yml`) rather than Secret Manager. The intended
Secret-Manager-backed path is still real infrastructure
(infrastructure/environments/production/smtp.tf) — it's just not wired up
to the code right now, and applying or not applying it has no effect on
deploys either way (see the comment at the top of that file).

Founder action so far:
1. ~~Provision an SMTP mailbox for outbound invoices~~ — done: a mailbox on
   mybackhaul.app hosted via IONOS (Microsoft 365 reseller) —
   `smtp.ionos.co.uk`.
2. ~~Set the SMTP_USER/SMTP_PASSWORD repo SECRETS~~ — done
   (Settings → Secrets and variables → Actions → Secrets).
3. ~~Set the SMTP_HOST/SMTP_PORT/SMTP_FROM repo VARIABLES~~ — done
   (same page, Variables tab). Confirmed via the deploy job's own step name,
   which echoes the (non-secret) resolved value — `if [ -n
   "smtp.ionos.co.uk" ]; then`.
4. ~~Confirm a real send-test-invoice-email lands~~ — the founder toolbar's
   status readback (see below) surfaced a REAL, unrelated failure on the
   first live attempt: `invoice PDF rendering failed: Error: ENOENT: no such
   file or directory, open '/workspace/dist/data/Helvetica.afm'`. Root cause
   + fix in the incident round below — SMTP config itself was never the
   problem by this point.
5. Optional, later: migrate to real Secret Manager — enable the Secret
   Manager API, `terraform apply` smtp.tf, then reintroduce
   `defineSecret()`/`secrets: [...]` in a dedicated, deploy-tested change
   (not assumed to work from reading the docs, given the incidents below).

**INCIDENT round 3 (self-inflicted, caught via the founder toolbar's
send-test-invoice-email status readback — it polls its own outbox task and
shows the drain's real outcome, rather than a permanent "Queued"):**
pdfkit (used for the invoice PDF attachment) reads its standard font metrics
(Helvetica etc.) from disk at runtime, relative to its own `__dirname` —
`fs.readFileSync(__dirname + '/data/Helvetica.afm')`. esbuild bundles
pdfkit's CODE into `functions/dist/index.cjs`, but can't bundle a file read
at runtime, and `firebase.json`'s functions `ignore` list excludes
`node_modules` from the deploy entirely. So the deployed function had
pdfkit's logic but none of its font data — every invoice PDF render (real
or test) threw `ENOENT ... dist/data/Helvetica.afm` from the moment
`sendTestInvoiceEmail`/`sendInvoiceEmail` first exercised it, invisibly,
since nothing surfaced the failure until the toolbar's status readback
existed to show it. Passed every unit test because dev/CI always run
against the real `node_modules/pdfkit/js/data/*.afm` — never bundled,
never deployed, never missing there. Fixed by
`functions/scripts/copy-pdfkit-fonts.mjs` (wired into `functions/package.
json`'s `build` script): resolves pdfkit via `@mbh/provider-nodemailer`
(pnpm's strict, non-hoisted node_modules means pdfkit isn't reachable
directly from `functions/` — only from the package that actually declares
it as a dependency) and copies its `data/*.afm` directory to `functions/
dist/data/`, the exact path the bundled `__dirname` resolves to once
deployed. Verified by reproducing the exact failure AND the fix in an
isolated environment (a bare temp directory, cleared `NODE_PATH`, no repo
node_modules reachable) before shipping — not just inferred from reading
the code. New regression test: `functions/integration/pdfkit-fonts.
integration.test.ts` asserts every standard-font `.afm` file lands in
`dist/data` after a real build.

Before step 1-3, `SMTP_USER`/`SMTP_PASSWORD` were empty strings, so the
drain's `sendInvoiceEmail`/`sendTestInvoiceEmail` tasks failed cleanly (the
SMTP connection attempt fails inside sendInvoice's existing try/catch,
wrapped as a recoverable MailerError, retried a few times then permanently
failed — no different from any other Mailer failure) — everything else
(evidence, delivery status, the job event trail) was unaffected; billing is
additive, not load-bearing for the delivery flow, and — critically, after
this incident — it being unconfigured never blocked deploying anything else
either.

Verified: 194 unit tests green (drain claim/retry/failure paths, invoice
HTML/PDF rendering, NodemailerMailer with an injected fake transport — no
real SMTP call in CI, including a regression test for the incident above: a
throwing credential getter fails only sendInvoice, never the constructor),
`pnpm seed`'s walking skeleton now runs deliverJob -> a second drain pass ->
a captured invoice end-to-end against the in-memory mock. Could NOT run
`terraform fmt`/`validate` (no terraform binary in this sandbox) — the
founder should run both before applying.

## PoD photo upload + invoice attachments (in progress; founder provisions Storage)

Building toward: attach the PoD photo(s), the recipient's signature, and
their name to the invoice email. Landing in slices (small increments, each
independently green):

1. **Done** — domain + interfaces: `ObjectStorageUploader` (client, Blob),
   `ObjectStorageReader` (server, Buffer) — split rather than combined
   since client/server never interchange, mirroring the AuthClient/
   AuthProvider split. `BlobStore` for local (offline) blob holding.
   `Mailer.sendInvoice` gains an optional `MailAttachment[]` second
   parameter. In-memory mocks + unit tests for all of it. Nothing calls any
   of this yet.
2. **Done** — real providers + rules: `@mbh/provider-firebase-storage-admin`
   (server download, `firebase-admin/storage`) and
   `@mbh/provider-firebase-storage-web` (client upload, `firebase/storage`).
   `firebase/storage.rules`: write-only, scoped to the job's assigned
   driver (`jobs/{jobId}.driverActorId == uid`, checked cross-service via
   `firestore.get()`), max 10MB, must be an image — never client-readable,
   only the drain (admin SDK, bypasses rules) ever downloads. Uses the
   project's **default** Firebase-managed bucket — no dedicated Terraform
   bucket resource (would fight Firebase's own bucket lifecycle).
   `pnpm test:rules` now covers both firestore + storage.

   **FOUNDER ACTION NEEDED, and CI deliberately does NOT deploy
   `storage.rules` yet** — learned the hard way already once this session
   (see the SMTP/Secret-Manager incident above: a not-yet-provisioned
   dependency for ONE target broke the entire combined deploy command,
   functions+hosting+firestore included, twice, before the fix). The same
   risk applies here: `firebase deploy --only storage` against a project
   where Cloud Storage was never enabled could fail the same way. So:
   1. Founder enables Cloud Storage for Firebase via the console
      (Build → Storage → Get started) — a one-time click, no code involved.
   2. Founder (or a verified-safe CI change afterwards) runs
      `firebase deploy --only storage --project mybackhaul-app` ONCE,
      manually, to confirm it succeeds against the now-enabled service.
   3. Only THEN does `.github/workflows/ci.yml`'s deploy step gain
      `storage` in its `--only` list (currently
      `--only functions,hosting,firestore`) — a small, deliberate,
      separately-verified change, not bundled into this slice.
   Until all three steps happen, `firebase/storage.rules` exists in the
   repo but is NOT live — uploads would be denied by Storage's own
   secure-by-default rules (equivalent to firestore.rules' deny-by-default,
   just not yet pushed). Nothing depends on this yet regardless (the
   reader/uploader aren't wired into the drain or the capture UI until the
   slices below land) — but it needs doing before slice 3-4 go live.
3. Not started — real photo capture: today `MarkDelivered.tsx`'s
   `addPhotos()` only fakes a ref string (`capture://name:size`); the real
   `File` is discarded. This slice makes it real: local IndexedDB blob
   holding (offline-safe, zero signal needed to capture), uploaded by the
   sync queue once online, before the `deliverJob` dispatch — a new
   optional `resolvePayload` hook on `SyncQueue`. The signature stays
   exactly as it is today (an inline base64 PNG data URL) — a photo can be
   1-5MB and would blow Firestore's 1MiB document cap stored the same way;
   a signature is a few KB and is already fine.
4. Not started — the drain reads the job's PoD evidence and attaches the
   photo(s) + decoded signature to the invoice email, best-effort (a
   missing/unresolvable attachment never blocks the invoice itself
   sending — matches the existing "billing is additive" precedent).
5. Not started — a `resendInvoiceEmail` action + founder toolbar UI (reuses
   the send-test-invoice-email status-readback pattern) so an
   already-delivered job's invoice can be resent on demand — necessary
   because the automatic send only fires once, at delivery time.

## Next step

- Founder: run docs/runbooks/osrm.md to stand up OSRM, then set the
  OSRM_BASE_URL repo variable. Migrate the prototype's real accounts at cutover.
- SMTP secrets/variables are set and confirmed reaching the deployed
  function (IONOS-hosted mailbox); the pdfkit font-data deploy bug that was
  blocking every invoice PDF (round 3 above) is fixed. Migrating to real
  Secret Manager (infrastructure/environments/production/smtp.tf) is
  optional, later work, not blocking.
- Founder: enable Cloud Storage for Firebase (see "PoD photo upload" above)
  before the photo-capture/invoice-attachment slices land.

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
- OSRM: config + self-hosting infra are in place (OSRM_BASE_URL env +
  infrastructure/osrm/ + docs/runbooks/osrm.md). The drain still defaults to the
  public demo server until the founder runs the OSRM runbook and sets the
  OSRM_BASE_URL repo variable. postcodes.io is keyless and fine.
- Firestore indexes: the emulator does NOT enforce them, so a missing
  production index passes every test. The membership collection-group
  query (members.actorId) needs a COLLECTION_GROUP index — now in
  firebase/firestore.indexes.json. Any new collectionGroup/ordered query
  must add its index here or it fails ONLY in prod.
- The drain skips a task stuck 'claimed' by a crashed run for up to 5 minutes
  (STALE_CLAIM_MS) before reclaiming — acceptable; there is no time-range
  query in the DataStore contract to make it tighter without an index.
- Prototype (cpwaters/mbh-2) stays live as demo; account migration script
  happens at cutover.
