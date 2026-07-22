# Slice 0002: Security rules + rules tests (bootstrap step 4)

Start cold from here after slice 0001 (Action Layer) is complete. Read
CLAUDE.md and docs/reference/architecture.md §5 first.

## Goal

Defence in depth at the database layer: deny-by-default Firestore rules that
re-enforce the action layer's model, with an explicit allow/deny test per
collection.

## Build

1. `firebase/firestore.rules` (or platform/):
   - Deny-by-default: any path not explicitly allowed is denied.
   - Business collections (loads, jobs, jobs/*/events, audit) are client
     READ-only and membership-gated: a client may read a tenant-scoped doc
     only if they are an active member of the owning tenant; a Job is
     readable by members of EITHER the shipper or carrier tenant.
   - ALL client writes to business collections are denied — writes only
     happen server-side through dispatch.
   - requests/* (idempotency markers) and invites are NEVER client-readable.
   - members/* readable by members of the same tenant.
2. `firebase/firestore.indexes.json`: the composite indexes the queries need
   (jobs by driverActorId; loads by status; later, the drain's outbound
   query). Forgetting an index breaks the query in prod — they live in the
   repo and deploy with the app.
3. `pnpm test:rules` with @firebase/rules-unit-testing against the emulator:
   every collection has allow AND deny cases. A new collection without a
   rules block + test fails review.

## Definition of done

pnpm test:rules green in CI (add the emulator to the workflow), every
collection covered, HANDOFF + CLAUDE updated. Note: this introduces the
Firebase emulator to CI — the first infra-touching slice, but still no
cloud project or cost.
