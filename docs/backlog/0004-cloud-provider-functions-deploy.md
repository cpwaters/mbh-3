# Slice 0004: Real cloud — Firestore provider, functions, Terraform, deploy (step 6)

FOUNDER PREREQUISITE (out of chat): create the Firebase/GCP project +
enable billing; note the project id. This is the first slice that can cost
money — everything before runs on the emulator for free. Secrets never
transit chat; the founder puts them into Secret Manager directly.

## Build

1. `packages/providers/firestore`: FirestoreDataStore implementing the
   DataStore interface with the Firebase Admin SDK. Must pass the EXISTING
   DataStore contract suite unchanged — add `pnpm test:contract` running
   that suite against the emulator. Re-verify the idempotency-under-
   contention note in HANDOFF (Firestore retries the transaction on the
   marker's already-exists; observable outcome must match the mock).
2. `functions/`: exactly two gen2 functions (europe-west2):
   - dispatch — all HTTP: POST /api/dispatch (authenticateActor with real
     Firebase token verification → the action registry → structured
     JSON response the HttpDispatchTransport already parses), /health,
     future webhooks. Wire the composition root (FirestoreDataStore +
     Firebase auth provider).
   - drain — 1-minute schedule; walks outbound work with a CAS claim (none
     yet — a no-op skeleton with the claim/backoff/record shape ready).
3. Hosting: firebase.json rewrites /api/** and /health to dispatch; serve
   apps/web/dist statically. PUBLIC_USE_EMULATORS build flavour; always
   rebuild the prod bundle after.
4. `infrastructure/`: Terraform (google provider) — budget alert, uptime
   check on /health, WIF pool/provider pinned to the repo. No secrets in
   state.
5. CI deploy job: needs validate; main only; gated on PRODUCTION_DEPLOY ==
   'true'; keyless WIF auth; deploys functions + hosting + indexes together.
6. `pnpm smoke:prod`: /health 200, /api/dispatch rejects unauthenticated,
   webhooks fail closed, pages 200, live-bundle freshness, console sweep.
   Run after every deploy.

## Definition of done

test:contract green (mock and Firestore provably identical); the offline
queue's /api/dispatch posts now succeed against the real dispatch function
(the loop closes end to end); a deploy from CI on green; smoke:prod green.
Migrate the prototype's real accounts by script at cutover (separate slice).
