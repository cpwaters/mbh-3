import { type Address, type LoadRoute, MAX_OUTBOX_ATTEMPTS, type OutboxTask } from '@mbh/domain';
import { auditDoc, loadDoc, outboxCollection } from '@mbh/paths';
import type { DataStore, Geocoder, RouteProvider } from '@mbh/provider-interfaces';

// The scheduled drain's logic, pure of the vendor SDKs and the clock so it
// runs against the in-memory providers in CI and against Firestore + the real
// HTTP adapters in production — identical code. The function shell (functions/
// src/drain.ts) only injects the concrete providers.

export interface DrainDeps {
  store: DataStore;
  geocoder: Geocoder;
  routeProvider: RouteProvider;
  now(): string; // ISO-8601 UTC
  newId(prefix: string): string;
}

export interface DrainSummary {
  reclaimed: number; // stale claims reset to pending
  enriched: number; // route recorded
  retried: number; // recoverable failure, left pending for the next run
  failed: number; // permanently gave up
  skipped: number; // lost the claim race / nothing to do
}

// Bound the work per invocation (the 1-minute schedule keeps draining) and the
// age past which a 'claimed' task is assumed abandoned by a crashed run.
const MAX_PER_RUN = 10;
const STALE_CLAIM_MS = 5 * 60 * 1000;

export async function runDrainOnce(deps: DrainDeps): Promise<DrainSummary> {
  const summary: DrainSummary = { reclaimed: 0, enriched: 0, retried: 0, failed: 0, skipped: 0 };

  summary.reclaimed = await reclaimStale(deps);

  const pending = await deps.store.query({
    collection: outboxCollection(),
    filters: [{ field: 'status', op: '==', value: 'pending' }],
    limit: MAX_PER_RUN,
  });

  for (const row of pending) {
    const outcome = await processTask(deps, row.path);
    summary[outcome] += 1;
  }

  return summary;
}

// Self-heal: a run that crashed after claiming leaves a 'claimed' task; reset
// any whose claim has gone stale so it becomes eligible again.
async function reclaimStale(deps: DrainDeps): Promise<number> {
  const nowMs = Date.parse(deps.now());
  const claimed = await deps.store.query({
    collection: outboxCollection(),
    filters: [{ field: 'status', op: '==', value: 'claimed' }],
    limit: MAX_PER_RUN,
  });

  let reclaimed = 0;
  for (const row of claimed) {
    const claimedAt = typeof row.data.claimedAt === 'string' ? Date.parse(row.data.claimedAt) : 0;
    if (nowMs - claimedAt < STALE_CLAIM_MS) continue;
    const ok = await deps.store.runTransaction(async (tx) => {
      const t = await tx.get(row.path);
      if (t === null || t.status !== 'claimed') return false;
      tx.write({
        kind: 'update',
        path: row.path,
        data: { status: 'pending', lastError: 'reclaimed after stale claim' },
      });
      return true;
    });
    if (ok) reclaimed += 1;
  }
  return reclaimed;
}

type ProcessOutcome = 'enriched' | 'retried' | 'failed' | 'skipped';

async function processTask(deps: DrainDeps, taskPath: string): Promise<ProcessOutcome> {
  // Claim via CAS and read the load in the SAME transaction.
  const claim = await deps.store.runTransaction(async (tx) => {
    const task = (await tx.get(taskPath)) as (OutboxTask & Record<string, unknown>) | null;
    if (task === null || task.status !== 'pending') return null; // lost the race
    const load = await tx.get(loadDoc(task.loadId));
    tx.write({
      kind: 'update',
      path: taskPath,
      data: { status: 'claimed', claimedAt: deps.now(), attempts: task.attempts + 1 },
    });
    return { task, load };
  });

  if (claim === null) return 'skipped';
  const attempts = claim.task.attempts + 1;

  if (claim.load === null) {
    await settle(deps, taskPath, 'failed', 'load not found');
    return 'failed';
  }

  const origin = claim.load.origin as Address;
  const destination = claim.load.destination as Address;

  try {
    const [from, to] = await Promise.all([
      deps.geocoder.lookup(origin.postcode),
      deps.geocoder.lookup(destination.postcode),
    ]);
    if (from === null || to === null) {
      await settle(deps, taskPath, 'failed', 'postcode not found');
      return 'failed';
    }

    const route = await deps.routeProvider.drivingRoute(from, to);
    if (route === null) {
      await settle(deps, taskPath, 'failed', 'no driving route');
      return 'failed';
    }

    await recordEnrichment(deps, taskPath, claim.task.loadId, {
      origin: from,
      destination: to,
      distanceMeters: route.distanceMeters,
      durationSeconds: route.durationSeconds,
      enrichedAt: deps.now(),
    });
    return 'enriched';
  } catch (error) {
    const recoverable = (error as { recoverable?: boolean }).recoverable !== false;
    const message = error instanceof Error ? error.message : String(error);
    if (recoverable && attempts < MAX_OUTBOX_ATTEMPTS) {
      await settle(deps, taskPath, 'pending', message); // retried next run
      return 'retried';
    }
    await settle(deps, taskPath, 'failed', message);
    return 'failed';
  }
}

// Record the outcome as a system-sourced action: the route on the load, the
// task done, and a source:'system' audit entry — all in ONE transaction. No
// human can fabricate this outcome (all client writes are denied by rules).
async function recordEnrichment(
  deps: DrainDeps,
  taskPath: string,
  loadId: string,
  route: LoadRoute
): Promise<void> {
  await deps.store.runTransaction(async (tx) => {
    const task = await tx.get(taskPath);
    if (task === null || task.status !== 'claimed') return; // already settled elsewhere
    tx.write({ kind: 'update', path: loadDoc(loadId), data: { route: { ...route } } });
    tx.write({ kind: 'update', path: taskPath, data: { status: 'done' } });
    tx.write(
      systemAuditOp(deps, 'enrichLoadRoute', {
        loadId,
        distanceMeters: route.distanceMeters,
        durationSeconds: route.durationSeconds,
      })
    );
  });
}

async function settle(
  deps: DrainDeps,
  taskPath: string,
  status: 'pending' | 'failed',
  lastError: string
): Promise<void> {
  await deps.store.runTransaction(async (tx) => {
    const task = await tx.get(taskPath);
    if (task === null || task.status !== 'claimed') return;
    tx.write({ kind: 'update', path: taskPath, data: { status, lastError } });
    if (status === 'failed') {
      tx.write(
        systemAuditOp(deps, 'enrichLoadRoute.failed', { loadId: task.loadId, lastError })
      );
    }
  });
}

function systemAuditOp(deps: DrainDeps, action: string, detail: Record<string, unknown>) {
  const auditId = deps.newId('audit');
  return {
    kind: 'create' as const,
    path: auditDoc(auditId),
    data: { auditId, action, actorId: 'system', at: deps.now(), source: 'system', ...detail },
  };
}
