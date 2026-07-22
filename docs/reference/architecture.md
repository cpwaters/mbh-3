# The printing press — inherited architecture

This is the distilled machine behind MyBackHaul — a compliance-first,
offline-capable, solo-founder B2B SaaS that went from empty repo to
production revenue-ready with every deploy tested, every legal record
auditable, and near-zero idle cost.

*When it fits*: B2B SaaS where users create records that matter (legal,
financial, operational), field/mobile conditions are real (bad connectivity,
shared devices), third parties must be integrated but never trusted as
architecture, and one founder ships fast with AI doing the engineering.

*How to use*: give Claude this file plus a one-page product brief (who
pays, what job, what's legally required, what's the "30-second moment").
Claude scaffolds the skeleton below, then builds features as vertical
slices. Every decision that isn't domain-specific is already made here —
don't relitigate them, inherit them.

---

## 1. Core principles (the non-negotiables)

1. *The record of record lives server-side and is append-only.* The
   authoritative business state is the immutable record (receipt, invoice,
   filing). Corrections are new records, never edits. Evidence and the
   status change it justifies commit in ONE atomic batch — they can never
   exist without each other ("the atomic legal event").
2. *One mutation path.* An Action Layer is the only way business state
   changes. No UI component, scheduled job, or webhook writes business
   documents directly. "If a feature cannot be executed as an Action, it is
   not a valid feature."
3. *Offline-first is an architecture, not a feature flag.* The device
   queue comes before anything pretty. Capture must succeed with zero
   signal; delivery is retried, idempotent, and honest about its state.
4. *Vendors are replaceable implementations.* Business logic depends on
   provider interfaces, never vendor SDKs. Every external service (cloud DB,
   government API, payment processor, marketplace) sits behind an interface
   with a scriptable in-memory mock that CI uses by default.
5. *Zero-to-low idle cost.* Static hosting, a SMALL fixed number of
   serverless functions (BreakerHQ: exactly two — one HTTP dispatcher, one
   scheduled drain), budget + error alerts in Terraform. A product with no
   users this month should cost pounds, not hundreds.
6. *Third-party calls never happen synchronously in a user request.*
   External delivery belongs to a scheduled drain that claims work with a
   compare-and-swap (queued → submitting), retries with backoff, and
   records outcomes as system-sourced actions.
7. **Infrastructure is Terraform; operations are Firestore (or equivalent).
   Deploys go through CI on green.** Hand-deploys are an emergency escape
   hatch, documented as such, because they have shipped crashes.

## 2. The reference stack (name the tools; keep the seams)

The principles above are tool-agnostic; this stack is the PROVEN instance.
Default to it wholesale — every piece is known to work with every other
piece, with the emulator story, the CI story, and the cost story already
solved. Swap a piece only with a reason, and only behind its interface.

- *Monorepo*: pnpm workspaces, TypeScript strict everywhere,
  tsc -b project references (pnpm typecheck emits dist).
- *Web*: **Astro** (static output) + **React islands**. Landing, legal
  and /docs/ pages are pure Astro (zero JS); the app itself is one React
  island served at its own route. Fonts: @fontsource **Barlow** +
  **Barlow Condensed** (the industrial look). PWA via a hand-written
  service worker: network-first navigations, versioned shell cache (bump
  the cache name to force-clear stale clients), manifest.webmanifest.
- *Validation*: **Zod** for every payload, provider response and webhook
  body — parse, never cast.
- *Backend*: **Firebase** — Firestore (operational state), Auth
  (email/password; shared field tablets), Hosting (static + rewrites to
  functions), **gen2 Cloud Functions** in one region (BreakerHQ:
  europe-west2), Secret Manager via defineSecret. Exactly two functions:
  dispatch (all HTTP: /api/dispatch, /health, webhooks) and a 1-minute
  scheduled drain.
- *Infrastructure*: **Terraform** (google provider) for budgets, alert
  policies, uptime checks, WIF; Firestore indexes deploy with the app
  (forgetting an index breaks the drain query — they're in the repo).
- *Tests*: **Vitest** (unit + contract), **@firebase/rules-unit-testing**
  (rules), **Playwright** (E2E + docs screenshots), **eslint flat config**
  with typescript-eslint + eslint-plugin-react-hooks (rules-of-hooks =
  error; it's load-bearing).
- *CI/CD*: **GitHub Actions**; deploy job authenticates keylessly with
  google-github-actions/auth (Workload Identity Federation, repo-pinned
  attribute condition); firebase-tools CLI deploys functions + hosting +
  indexes.
- *Payments*: **Stripe** — Checkout + Customer Portal + a
  signature-verified webhook; tier derived from the Price id; fail-closed
  until secrets exist. Provision products/prices/webhook/portal via the
  Stripe REST API, not dashboard clicking.
- *PDF export*: **jsPDF** + jspdf-autotable, client-side (evidence packs
  read from the SERVER, never the offline cache).
- *Live-API validation*: labs/ scripts run with **tsx** against the
  real third-party APIs (token, reference data, drift detection) before
  any adapter is written; fixtures checked in.
- *Local dev*: the **Firebase emulator suite** IS the integration
  environment — auth + firestore + functions + hosting run everything the
  cloud runs; PUBLIC_USE_EMULATORS=true builds the emulator-flavoured
  bundle (and the prod bundle is always rebuilt after, so a deploy can
  never ship it).

## 3. Layering (enforce with import rules, not discipline)

```text
Web app (static site + islands; PWA)
  → Action Layer         validate → authorize → effect (+ audit + marker)
  → Domain Layer         entities + invariants — ZERO vendor imports
  → Provider Interfaces  contracts (DataStore, each external service)
  → Provider Impls       vendor SDKs live HERE and only here
  → Infrastructure       Terraform-managed cloud
```

Import boundaries (make lint/review enforce them):

- domain/actions/offline/auth packages must NOT import vendor SDKs, React,
  or browser APIs.
- Each vendor SDK is allowed in exactly one provider package.
- Providers are injected (DI at the composition root), never instantiated
  in domain or action code.
- The browser NEVER writes business documents; all mutations go through
  POST /api/dispatch (one HTTP function hosting all actions).

## 4. The cross-cutting patterns (new features reuse these, never invent)

1. *Action pipeline*: payload safeParse (Zod) → `requireMember(store,
   tenantId, actorId, roles)` → effect. The actor is resolved from the auth
   token at the boundary — never trust a client-supplied actor id.
   Structured errors {code, message, field, recoverable}, never string
   throws.
2. *Audit in the same batch*: every action writes its audit entry
   atomically with its effect (a buildAuditOp helper).
3. *Idempotency markers*: offline-retriable actions write a
   requests/{requestId} marker in the same batch. A replayed requestId
   returns the ORIGINAL result; a requestId reused by a different action is
   refused. Keep a registry of idempotent action types pinned by a test.
4. *Batch or transaction, never sequential writes*: multi-doc effects use
   an atomic batch; read-guard-write flows (the drain claiming work) use a
   transaction with a status CAS.
5. *Tenant paths from ONE helper module*: every tenant-scoped document
   carries a denormalized tenantId; every new collection gets a security
   rules block (absence denies) AND a rules test.
6. *Zod-validate every external input*: payloads, provider responses,
   webhook bodies. Money and quantities are positive, finite, bounded.
7. *The scheduled drain*: one function on a 1-minute schedule walks
   pending outbound work (government filings, marketplace publishes),
   claims via CAS, calls the provider, and records the outcome as a
   system-sourced action in the same batch as its evidence.

## 5. Security model (one paragraph, three layers)

Authentication resolves once at the boundary (an authenticateActor in the
dispatch function). Authorization is requireMember inside every
tenant-scoped action. Security rules re-enforce the same model at the DB
layer — defence in depth: business data is client-READ-only and
membership-gated; invites and request markers are never client-readable;
ALL client writes to business collections are denied. Outcome-recording
actions (external filings, payment status) require source === 'system' —
no human can fabricate an outcome. Roles are a small fixed set with
per-action role lists (e.g. LISTING_ROLES, UPLOAD_ROLES). Members are
disabled, never deleted (audit attribution survives). Secrets live in the
platform secret manager, never in code, logs, or audit entries; secret
values never transit chat — the founder puts them into Secret Manager
directly or hands them over out-of-band.

## 6. Repository skeleton

```text
apps/web/                  static site + framework islands (PWA; the core
                           flow is the home screen)
packages/
  domain/                  entities + invariants (zero deps)
  <wire>/                  external-service wire schemas + the ONE mapper
  offline/                 pure sync-queue engine + idempotent-action registry
  auth/                    authenticateActor
  actions/                 action handlers + registry (dispatch entry point)
  providers/interfaces/    contracts + the DataStore CONTRACT test suite
  providers/mocks/         in-memory scriptable providers (CI default)
  providers/<vendor>/      one package per vendor SDK
functions/                 the two serverless functions (+ staged deploy dir)
firebase|platform/         security rules (+ tests), indexes
infrastructure/            Terraform (environments/<env>, modules/)
scripts/                   seed, smoke-prod, migrations
labs/                      live-API validation scripts + fixtures (real
                           credentials, run by hand pre-integration)
e2e/                       browser journeys (tests/) + docs screenshots (docs/)
docs/adr | docs/backlog | docs/reference | docs/runbooks | docs/HANDOFF.md
CLAUDE.md                  the INVARIANTS (this file's project instance)
```

## 7. Testing pyramid (all of it, from day one)

- pnpm test — unit, Firebase-free, mocks only. Includes a **DataStore
  contract suite** run against the in-memory provider.
- pnpm test:rules — security rules against the emulator. Every collection
  has explicit allow/deny tests.
- pnpm test:contract — the SAME DataStore contract suite against the real
  provider on the emulator (mock and real provably behave identically).
- pnpm test:e2e — Playwright browser journeys against the FULL emulator
  stack (auth + db + functions + hosting), selectors are user-visible text
  ONLY ("if the words change, the test should fail"). Each test mints its
  own tenant; an admin REST helper seeds states the UI can't reach. The
  script rebuilds the production web bundle afterwards so a later deploy
  can never ship the emulator build.
- pnpm smoke:prod — post-deploy production smoke: health endpoint,
  webhooks fail closed, pages 200, live-bundle freshness, headless console
  sweep. Run after EVERY deploy.
- pnpm lint — the framework footguns as ERRORS (for React:
  react-hooks/rules-of-hooks — a hook after an early return blanks the
  whole screen and shipped twice before this was enforced). Lint runs in CI.
- pnpm docs:shots — regenerates user-docs screenshots by walking the real
  product on the emulator (separate Playwright config/testDir so the main
  suite is untouched). Committed images; a renamed button fails loudly.

## 8. CI/CD (the only deploy path)

GitHub Actions, one workflow, two jobs:

- *validate*: typecheck (both layers) → lint → unit → rules → E2E → build.
- *deploy*: needs validate; push to main only; gated on a repo variable
  (PRODUCTION_DEPLOY == 'true'); serialized by a concurrency group;
  *keyless* auth via Workload Identity Federation (no service-account
  keys anywhere) with an attribute condition pinning the exact repo;
  deploys functions + hosting + indexes.

Rules: never firebase deploy by hand (emergency-only, with operator
creds). Deploy functions whenever actions change — a UI shipped against old
functions "works" while silently doing nothing. Small increments: green →
commit + push (CI deploys) → live-verify → zoom out (docs still match?).

## 9. Product/UX standards (what "quality" means at the gate)

- *Every status explains itself.* No mystery badges, counts, or spinners.
  If a state can't say what's happening in plain words, it's unfinished.
- *Every legally-weighted tap has a recorded undo.* Undo is the same
  experience as doing: stage → review names it as a correction → save. The
  record shows both, attributed.
- *The little-ⓘ rule*: helper prose hides behind a per-section ⓘ toggle;
  warnings, actual content, and money stay visible. Mandatory fields get a
  red star and nothing else.
- *Colour grammar*: green = in order; orange = work still to do (not an
  error); amber = caution/one-way door; red = danger/destructive confirm.
- *Confirmation grammar*: one-way doors get a two-tap confirm with plain
  words about what stays and what changes; cancel is a red text button.
- *Offline honesty*: queued work shows "waiting for signal…" rows and a
  badge that counts exactly what's queued; reconnect drains automatically.
- *Speak the trade's vocabulary* in UI copy, not database nouns.
- *Never claim endorsement you don't have.* Marketing states verifiable
  facts ("built to X standard", link to the official source) until the
  official listing exists — then flip, with the flip pre-written in the
  checklist.

## 10. Documentation system (why any session can continue the work)

- *CLAUDE.md* = invariants only (this printing press, instantiated).
  Counts and dates stay OUT (they go stale by construction). If code and
  CLAUDE.md disagree, fix whichever is wrong.
- *docs/adr/* = numbered decisions with rationale (why the queue looks
  like this, why the drain is one function, why keyless deploys).
- *docs/HANDOFF.md* = current state + next steps, updated every session.
- *docs/backlog/* = executable next slices, written so a fresh session
  can start one cold.
- *Numbered spec package* at repo root = the product bible (data model,
  flows, permissions, external wire formats).
- *docs/runbooks/* = the human+Claude choreography for key days (payment
  provider go-live, marketplace go-live, credential rotation, restore
  drill).
- *A go-live checklist* with WHO does each item and what it unblocks.
- *Public user docs* (/docs/ on the product site): a hub + one guide per
  workflow, numbered 1-2-3 steps quoting exact UI labels, real product
  screenshots regenerated by docs:shots, JSON-LD (HowTo per guide,
  FAQPage on a Q&A page rendered from ONE array so visible text and markup
  can't drift) — docs double as SEO for humans and AI agents. Register new
  pages everywhere at once: nav, footer, sitemap.xml, llms.txt, caching
  headers.

## 11. Bootstrap order for a new project

1. Repo + pnpm workspace + the package skeleton (§6), CLAUDE.md from this
   template, CI with validate job from day one.
2. Domain entities + DataStore interface + in-memory provider + contract
   suite. A walking-skeleton seed script proves the spine.
3. Action layer: dispatch function, authenticateActor, requireMember, audit
   op, idempotency markers, paths module, first action + tests.
4. Security rules + rules tests (deny-by-default), tenant model, roles.
5. Offline queue engine + the PWA shell + the first real screen (the
   product's "30-second moment").
6. Real cloud provider behind the same contract suite; Terraform env;
   budget alert + uptime probe; deploy job (keyless WIF); smoke:prod.
7. External integrations: labs/ scripts against the live API first (token,
   reference data, drift check), then the adapter behind an interface, then
   the drain leg. Mock-first in CI forever.
8. E2E journeys as the regression net; lint footgun rules; docs system;
   user docs + screenshots when the flows stabilize.
9. Payments last (they gate features, not architecture): checkout,
   portal, and a signature-verified webhook; tier from price id;
   fail-closed; system-only status recording.

## 12. Hard-won lessons (each cost a production incident or a founder catch)

- A React hook after a conditional early return blanks the whole screen —
  and passes typecheck. Lint it as an error; prove the lint catches the
  exact shape with a canary before trusting it.
- Optimistic UI lies: only show success when the server action returned
  success. "It wasn't working when you said it was" is a trust-destroying
  bug class — verify outcomes, then add the E2E that checks server state.
- Shipping hosting without functions (or vice versa) makes features
  silently no-op. Deploy them together; CI does this for you.
- Forms that seed from a server snapshot will overwrite what a fast test
  (or fast human) typed — wait for the seed before filling.
- Conditionally-mounted faces of an animation unmount at the START of the
  exit transition and rotate a blank card; keep them mounted until the
  transition settles, with a timer fallback for reduced-motion where
  transitionend never fires.
- Piping command output (| tail) masks exit codes; capture to a log file
  and echo EXIT=$? instead.
- Anything a scheduled job delivers needs a stuck-work sweep and an
  alerting path; anything with a webhook must fail closed before its
  secret exists.
- Keep test/demo artifacts out of customer-facing pixels (screenshots,
  seeds for docs use believable display data), and purge test artifacts
  from production before the first paying stranger.
- Fixed timeouts in E2E are flakiness; every wait targets a user-visible
  state change.

## 13. Working style (how the founder and Claude operate)

- Bias to action; smaller scope; the core capture flow first; offline
  first; sell in person while Claude ships.
- Every feature answers before build: the human path, which Action, the
  permissions, the audit event, the provider interfaces, offline safety,
  idle cost. A missing answer means the design is incomplete.
- Critical review on request ("zoom in, zoom out"): verify the suite,
  audit the recent diff, check the docs still match the code, and fix the
  structural cause of any bug class that shipped — not just the instance.
- Secrets never transit chat. Destructive actions get founder confirmation
  with the target list shown first. Truthful marketing, always.
