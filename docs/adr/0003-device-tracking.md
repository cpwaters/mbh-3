# ADR-0003: Tracking the driver's device — what a Life360-class implementation requires

## Status

Proposed. Investigation only; nothing here is built yet.

## Context

The founder wants mbh-3's tracking to be "better than the current
implementation", with Life360 as the reference point. This records what
Life360 actually does, what we actually do today, and what closing the gap
costs — so the decision is made on the real numbers rather than on the
assumption that tracking is a tuning problem.

**What is being tracked is the phone of the person using the app** — the
driver's mobile — not the vehicle. That is the founder's stated intent and it
is the right frame for everything below: Life360 is the correct reference
precisely because it is a phone-tracking product, solving the same problem on
the same hardware. Telematics on the truck is a different product and is not
where this is going (see Consequences).

### What Life360 does

Four mechanisms, in order of how much they matter:

1. **Native background execution.** On iOS, Core Location with background
   location updates, significant-location-change and region monitoring; on
   Android, a foreground service with FusedLocationProvider. Everything else
   is optimisation on top of this. Without it there is no tracking when the
   phone is in a pocket.
2. **Motion-aware adaptive sampling.** Life360's own engineering writing
   describes using FusedLocationProviderApi, GeofencingApi and
   ActivityRecognitionApi, and beta-testing Google's Activity Transition API
   for lower power. The device's activity (still / walking / driving) decides
   the sampling rate. Parked means near-zero sampling; driving means high
   rate. This is how continuous tracking survives a day on a battery.
3. **Geofencing instead of polling.** A boundary is registered with the OS,
   which wakes the app on crossing. Arrival detection costs nothing until it
   happens.
4. **Sensor fusion.** Accelerometer and gyroscope for drive detection, hard
   braking and crash detection — not derivable from GPS position alone.

The first is a platform capability, not a technique. It is the whole gap.

### What mbh-3 does today

Verified in the code, not assumed:

- `useDeviceLocation` runs `watchPosition` with `enableHighAccuracy: true`,
  `maximumAge: 0`, continuously, for the length of a job. Fixes coarser than
  100m are held back for at most two consecutive readings. The file's own
  comment is already honest that this is "the ceiling of what's achievable
  from a web app".
- `useRouteTracking` drops a breadcrumb every ~1 mile — straight-line
  distance from the last *recorded* point — through the offline sync queue
  into `recordRoutePoint`, stored as a `job.routePoint` JobEvent.
- `useJobProgressSync` advances the job's real status from GPS progress:
  `accepted → collected` at 3%, `collected → in_transit` at 10%.
- `journeyProgress` is the straight-line closure ratio between origin and
  destination. The delivery gate opens at 95% of it.

### The gaps, ranked by what actually hurts

**1. Tracking stops when the phone locks.** There is no background
execution and none is available to a PWA: `watchPosition` stops reporting
once the screen is off, on iOS especially. There is no `visibilitychange`
handling and no Wake Lock anywhere in the codebase — confirmed by grep. On a
four-hour trunk run with the phone in a cradle asleep, the trail is a point
at the yard and a point at the bay. This is a platform ceiling, not a
parameter we have mistuned.

**2. Nobody can see the tracking.** `job.routePoint` appears exactly once in
the codebase — the write. There is no client-side reader for job events at
all (`JobReader` exposes only `activeJobForDriver` and
`completedJobsForDriver`). The shipper's "View Route" geocodes the origin and
destination strings and draws a static line between them; it does not show
where the driver's phone is. **A shipper today cannot answer "where is my
load".** The breadcrumbs we carefully collect, queue offline and store are
written and never read by anything.

**3. Straight lines everywhere.** Progress is haversine closure, not distance
along the route, so a legitimate detour reads as lost progress and the 95%
gate can open early near a destination the driver has not reached by road.
There is no ETA anywhere in the product.

**4. Battery.** Full-rate GPS with `maximumAge: 0` and no motion awareness,
held for the whole job including 40 minutes parked on a bay. Avoiding exactly
this is what Life360's engineering effort is spent on.

**5. Breadcrumbs are coarse and can miss.** One mile is coarse for a trail,
and because the trigger measures from the last recorded point rather than
integrating the path, a circuitous mile records nothing.

Gap 2 is the one that costs the business today, and it is the cheapest to
close. Gap 1 is the one the founder is asking about, and it is the expensive
one.

## Decision

Proposed, in two stages, because they have very different costs and stage one
does not depend on stage two.

### Stage 1 — make the tracking we already have visible and honest (PWA)

No new platform, no app stores. Closes gaps 2, 3 and 5, and part of 4.

- A shipper-facing live view: read `job.routePoint` events for the load's job
  and draw the trail plus the latest position. **The Firestore rules already
  permit this** — `jobs/{jobId}/events` is readable by active members of
  either tenant — so this needs a reader and a component, no rules change.
- Route-aware progress and a real ETA, using the OSRM route the drain already
  computes and stores on the load, instead of straight-line closure.
- Adaptive foreground sampling: back off when stationary, and hold a Screen
  Wake Lock while a job is active so a cradled phone keeps its watch open.
- Say plainly in the UI when a position was last fixed. A stale point
  presented as live is worse than an honest "last seen 20 minutes ago".
- A driver-operated **pause**, and **stop detection** from speed. Both are
  covered below; both belong to stage 1 and neither substitutes for stage 2.

#### Pausing, and detecting stops

Two mechanisms the founder proposed. Both are worth building, for different
reasons than they first appear.

**A pause button is the answer to the consent problem**, not a tracking
improvement. Consent a driver can actually exercise beats a clause in a terms
page. Three conditions make it worth having:

- It must be legible to the shipper. A dot that silently stops moving is
  worse than no tracking at all, because it reads as "stuck in traffic"
  rather than "not being tracked". "Paused by driver, 14:32" is honest.
- It must auto-resume. Drivers will pause at the services and forget, leaving
  an unexplained hole at exactly the point a dispute would care about.
- It is modelled as ordinary JobEvents — `job.trackingPaused` /
  `job.trackingResumed` — append-only, same collection, same rules, nothing
  new. The record then states that tracking was off and who turned it off,
  which is better evidence than a silent gap, not worse.

Sequencing: this must land AFTER the shipper live view, or the paused state
is something nothing can display — the same write-only mistake as gap 2.

**Speed gating cuts writes, not battery.** To know the speed you must already
be sampling GPS, so it reduces what is recorded and transmitted, not what is
sampled; the radio stays on either way. Life360's saving comes from the
opposite direction — activity recognition on a low-power motion co-processor
deciding when to turn GPS on — and the browser has no equivalent. What it
does buy is a cleaner trail and far fewer writes, which matters against the
per-job event volume noted below.

Two design notes on it:

- **Walking pace is the wrong threshold.** A truck crawling in a queue at
  3mph is below it and unambiguously working, so a naive cutoff goes silent
  exactly when a shipper most wants to know why their load is not moving. Use
  hysteresis instead: moving above ~5mph sustained, stopped below ~1mph for
  several minutes.
- **Record the stop; do not go silent.** "Stopped, Keele services,
  14:10–14:52" tells a shipper something. A gap tells them nothing. Same
  mechanism, better output, and closer to what telematics does.

`coords.speed` has been available across browsers since mid-2020 but is null
whenever the device cannot measure it (common on WiFi- or cell-derived
fixes), so this needs a fallback to distance-over-time between fixes, with
smoothing.

### Stage 2 — native background tracking (Capacitor)

The only way to get Life360-class behaviour. Wrap the existing web app in
Capacitor — it is already an installable PWA with a service worker, so this
wraps rather than rewrites — and add a background-geolocation plugin, which
is where the motion detection, stop detection, geofencing and batched upload
actually live.

Plugin options as of 2026: Transistorsoft's is the mature one (US$399 one-off
for a single app id; since 9.0.0 in March 2026 it requires a licence key for
iOS release builds as well as Android). Capawesome's is the main paid
alternative, weighted towards upload reliability rather than motion
detection. Capgo's fork is free.

## Consequences

**Stage 2 changes what this repo is.** Today it deploys as static hosting
plus two functions, from CI, on green. A native app adds an Apple developer
account (£99/yr), a Google Play account ($25 one-off), signing keys, store
review latency on every release, and a native build in CI. The
"green → deployed in five minutes" loop does not survive contact with app
review. That is the real cost, more than the plugin licence.

**Write volume needs a design answer before stage 2.** `recordRoutePoint`
writes one JobEvent per point. Today's one-mile breadcrumbs on a 200-mile
run are ~200 events. A background tracker sampling every 30 seconds over four
hours is ~480 events per job, and the point of stage 2 is to sample far more
often than once a mile. Either `recordRoutePoint` grows a batch form, or the
trail moves out of `jobs/{jobId}/events` into a rollup document per job.
Non-negotiable 1 (append-only) and non-negotiable 2 (one mutation path) both
still hold either way — a plugin's built-in "auto-sync HTTP" must be pointed
at `POST /api/dispatch` with the auth token, never at Firestore directly.

**Offline ownership overlaps.** A native plugin buffers points itself. That
duplicates what the sync queue does for route points specifically, and one of
the two has to own it. The sync queue must keep owning the PoD capture
regardless — that is the product's core moment and is not up for
renegotiation.

**Driver privacy becomes a real question at stage 2, and it is sharper
because the device is personal.** This is somebody's own phone, in their own
pocket, off-shift as well as on — a background tracker does not know the
difference unless we make it. That is a different proposition from a
foreground trail that plainly runs while a job is open, and in the UK it
engages employment and data-protection expectations (ICO guidance on
monitoring workers). At minimum: track only between collection and delivery,
say so plainly in the app, and make stopping possible without ringing the
office — which is what the stage 1 pause button is for, and why it is worth
building before there is any background tracking to pause. An owner-driver
tracking their own phone is an easier case than a haulier tracking an
employee's; the product has both. Worth taking advice on before shipping, not
after.

**The phone is the tracker, deliberately — so its limits are accepted, not
solved later.** It follows the driver rather than the trailer: it goes with
them into the services, and when the battery dies the trail stops even though
the load is still moving. That is a known trade, not a defect to be fixed by
bolting on telematics — hardware (tacho / OBD) is a different product, with a
per-vehicle install, and is not the direction. It is named here only so the
trade is a choice on the record rather than a surprise.

What it buys in exchange is real: every driver already carries the hardware,
onboarding is installing an app, and it works for an owner-driver with one
truck and a subcontractor on their first job alike — none of which is true of
a box wired into a cab.
