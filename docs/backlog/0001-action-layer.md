# Slice 0001: The Action Layer (bootstrap step 3)

Start cold from here. Read CLAUDE.md and docs/reference/architecture.md
§3–§5 first.

## Goal

The one mutation path exists: a dispatch entry point that runs
validate → authorize → effect (+ audit + idempotency marker) against the
DataStore interface, with the first two real actions.

## Build

1. `packages/paths` (or domain submodule): the ONE tenant-path helper
   module — `tenantDoc(tenantId)`, `memberDoc(tenantId, actorId)`,
   `loadDoc(loadId)`, `jobDoc(jobId)`, `jobEventDoc(jobId, eventId)`,
   `auditDoc(...)`, `requestMarkerDoc(requestId)`. No literal paths
   anywhere else, pinned by a lint or test.
2. `packages/auth`: `authenticateActor` — resolves the actor from a
   verified token at the boundary. For now define the `AuthProvider`
   interface + mock (real Firebase token verification arrives with the
   dispatch function in step 6).
3. `packages/actions`:
   - Zod payload schema per action; parse, never cast. Money via
     domain `isValidLoadPriceGbpPence`.
   - `requireMember(store, tenantId, actorId, roles)` — throws structured
     `{code:'forbidden', ...}` unless an ACTIVE member with an allowed role.
   - `buildAuditOp` — audit entry written in the SAME batch as the effect.
   - Idempotency: `requests/{requestId}` marker in the same batch; replay
     returns the original result; a requestId reused by a different action
     type is refused. Registry of idempotent action types pinned by a test.
   - Structured errors `{code, message, field?, recoverable}` — never
     string throws.
   - Action registry keyed by action type → handler.
4. First actions:
   - `postLoad` (shipper; roles: owner|dispatcher) — creates Load
     'available' + audit.
   - `acceptLoad` (carrier; roles: owner|driver) — TRANSACTION: CAS load
     available→matched, create Job 'accepted', first JobEvent, audit,
     request marker. Enforces one-active-job-per-driver via
     ACTIVE_JOB_STATUSES query.
5. Tests: unit tests per action against InMemoryDataStore — happy path,
   bad payload, wrong role, disabled member, CAS conflict, idempotent
   replay, cross-action requestId refusal.
6. Rewrite `scripts/seed.ts` to dispatch actions instead of composing
   writes by hand (its current form is the pre-action walking skeleton).

## Definition of done

pnpm typecheck && pnpm lint && pnpm test && pnpm seed green; HANDOFF.md
updated; CLAUDE.md layering globs still match reality.
