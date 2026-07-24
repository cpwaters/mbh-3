# ADR-0002: Raw loads are shipper-private; carriers browse a listing projection

## Status

Accepted and built. `listings/{loadId}` is written by postLoad, removed by
acceptLoad, and route-enriched by the drain; rules allow any signed-in user to
browse, server-only writes. A carrier browse *screen* is still to come.

## Context

Carriers must discover loads to accept them, but a Load document holds the
shipper's private commercial data (price basis, contacts, internal refs).
The two-sided marketplace means "the other side" must see *something* about
a load without seeing everything.

## Decision

- The raw `loads/{loadId}` document is readable only by active members of
  the owning shipper tenant (enforced in firestore.rules).
- Carriers browse a separate, deliberately-projected public listing
  collection (fields safe to expose: route, vehicle type, window, headline
  price) — to be built as its own slice.
- Acceptance still reads the raw load server-side in the acceptLoad action
  (admin credentials, rules bypassed), so the carrier never needs raw read
  access to accept.

## Consequences

- Rules stay tight (deny-by-default) instead of exposing raw loads to all
  signed-in users.
- A listing projection must be maintained (written by postLoad / updated on
  status change) before carriers have a real browse screen. Until then the
  marketplace browse is unbuilt; the driver flow starts from an
  already-accepted job (seedable) so step 5's capture moment isn't blocked.
