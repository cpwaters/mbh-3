# Slice 0003: Offline queue engine + PWA shell + the 30-second moment (step 5)

Start cold after slice 0002 (security rules). Read CLAUDE.md, the product
brief §4, and architecture.md §2 (Web/PWA) + §9 (UX standards) first.

## Goal

The device can capture the core moment — a driver marking a delivery in a
yard with NO signal — and the capture succeeds against a local queue,
delivering atomically on reconnect. This is the product's reason to exist.

## Build

1. `packages/offline`: a pure sync-queue engine (zero vendor/browser
   imports — it's a pure layer). Enqueue a dispatch request (type, payload,
   requestId); persist via an injected storage port (interface + mock;
   IndexedDB impl lives in a provider); drain by POSTing to /api/dispatch;
   honest states (queued / sending / delivered / failed-permanent). The
   idempotent-action registry from @mbh/actions decides what's queue-safe;
   a non-idempotent action must never be enqueued (pinned by a test).
2. `apps/web`: Astro static site + one React island for the app. PWA:
   hand-written service worker (network-first navigations, versioned shell
   cache), manifest.webmanifest. @fontsource Barlow + Barlow Condensed.
3. The first real screen: the driver's active job → "Mark Delivered" →
   photo + signature + recipient name → the deliverJob action (evidence +
   the delivered status change in ONE batch — the atomic legal event).
   Offline: the capture enqueues, shows "waiting for signal…", badge counts
   queued items, reconnect drains automatically.
4. New action `deliverJob` (carrier; owner|driver): transition job
   in_transit→delivered, write the PoD evidence doc + the status change +
   the append-only event, all one batch; idempotent; system cannot be
   spoofed (source stays 'member' but evidence is required).

## Definition of done

Unit tests for the queue engine (enqueue/drain/replay/failure); the screen
works offline in an E2E once the emulator hosting stack exists (may defer
the full E2E to step 8, but the queue engine + action are testable now).
This is the first slice with a browser bundle — keep the app island thin
and the capture flow first.
