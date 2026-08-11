import {
  buildInvoiceNumber,
  invoiceDueDate,
  MAX_OUTBOX_ATTEMPTS,
  type Address,
  type InvoiceData,
  type Job,
  type LoadRoute,
  type Member,
  type OutboxTask,
  type OutboxTaskType,
  type Tenant,
  type UserProfile,
} from '@mbh/domain';
import {
  auditDoc,
  jobDoc,
  jobEventDoc,
  jobsCollection,
  listingDoc,
  loadDoc,
  membersCollection,
  outboxCollection,
  tenantDoc,
  userProfileDoc,
} from '@mbh/paths';
import type { DataStore, Geocoder, Mailer, RouteProvider } from '@mbh/provider-interfaces';

// The scheduled drain's logic, pure of the vendor SDKs and the clock so it
// runs against the in-memory providers in CI and against Firestore + the real
// HTTP adapters in production — identical code. The function shell (functions/
// src/drain.ts) only injects the concrete providers.

export interface DrainDeps {
  store: DataStore;
  geocoder: Geocoder;
  routeProvider: RouteProvider;
  mailer: Mailer;
  now(): string; // ISO-8601 UTC
  newId(prefix: string): string;
}

export interface DrainSummary {
  reclaimed: number; // stale claims reset to pending
  enriched: number; // route recorded
  invoiced: number; // invoice email sent
  retried: number; // recoverable failure, left pending for the next run
  failed: number; // permanently gave up
  skipped: number; // lost the claim race / nothing to do
}

// Bound the work per invocation (the 1-minute schedule keeps draining) and the
// age past which a 'claimed' task is assumed abandoned by a crashed run.
const MAX_PER_RUN = 10;
const STALE_CLAIM_MS = 5 * 60 * 1000;

export async function runDrainOnce(deps: DrainDeps): Promise<DrainSummary> {
  const summary: DrainSummary = { reclaimed: 0, enriched: 0, invoiced: 0, retried: 0, failed: 0, skipped: 0 };

  summary.reclaimed = await reclaimStale(deps);

  const pending = await deps.store.query({
    collection: outboxCollection(),
    filters: [{ field: 'status', op: '==', value: 'pending' }],
    limit: MAX_PER_RUN,
  });

  for (const row of pending) {
    const outcome = await processTask(deps, row.path, row.data.type as OutboxTaskType);
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

type ProcessOutcome = 'enriched' | 'invoiced' | 'retried' | 'failed' | 'skipped';

function processTask(deps: DrainDeps, taskPath: string, type: OutboxTaskType): Promise<ProcessOutcome> {
  return type === 'sendInvoiceEmail'
    ? processSendInvoiceEmail(deps, taskPath)
    : processEnrichLoadRoute(deps, taskPath);
}

async function processEnrichLoadRoute(deps: DrainDeps, taskPath: string): Promise<ProcessOutcome> {
  // Claim via CAS and read the load in the SAME transaction.
  const claim = await deps.store.runTransaction(async (tx) => {
    const task = (await tx.get(taskPath)) as (OutboxTask & Record<string, unknown>) | null;
    if (task === null || task.status !== 'pending') return null; // lost the race
    const load = task.loadId !== undefined ? await tx.get(loadDoc(task.loadId)) : null;
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

    await recordEnrichment(deps, taskPath, claim.task.loadId as string, {
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
    // Mirror the route onto the carrier listing if the load is still available
    // (the listing is gone once accepted — don't resurrect it).
    const listing = await tx.get(listingDoc(loadId));
    if (listing !== null) {
      tx.write({
        kind: 'update',
        path: listingDoc(loadId),
        data: { route: { distanceMeters: route.distanceMeters, durationSeconds: route.durationSeconds } },
      });
    }
    // acceptLoad only denormalizes the route onto the Job if the load was
    // ALREADY enriched by acceptance time — a carrier accepting within the
    // same ~1-minute window as the drain's next run would otherwise get a
    // job that never shows a route on the map, since nothing else ever
    // revisits it. Backfill it here too, so the map always catches up once
    // enrichment lands, regardless of how the two raced.
    const jobs = await tx.query({
      collection: jobsCollection(),
      filters: [{ field: 'loadId', op: '==', value: loadId }],
    });
    for (const jobRow of jobs) {
      if (jobRow.data.route !== undefined) continue; // already has one
      tx.write({ kind: 'update', path: jobRow.path, data: { route: { ...route } } });
    }
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

// Billing: sends the invoice email once a job's proof of delivery lands
// (enqueued atomically by deliverJob — see actions/deliver-job.ts).
async function processSendInvoiceEmail(deps: DrainDeps, taskPath: string): Promise<ProcessOutcome> {
  const claim = await deps.store.runTransaction(async (tx) => {
    const task = (await tx.get(taskPath)) as (OutboxTask & Record<string, unknown>) | null;
    if (task === null || task.status !== 'pending') return null; // lost the race
    const job = task.jobId !== undefined ? await tx.get(jobDoc(task.jobId)) : null;
    tx.write({
      kind: 'update',
      path: taskPath,
      data: { status: 'claimed', claimedAt: deps.now(), attempts: task.attempts + 1 },
    });
    return { task, job };
  });

  if (claim === null) return 'skipped';
  const attempts = claim.task.attempts + 1;

  if (claim.job === null) {
    await settle(deps, taskPath, 'failed', 'job not found');
    return 'failed';
  }

  const job = claim.job as unknown as Job;

  try {
    const invoice = await buildInvoice(deps, job);
    if (invoice === null) {
      await settle(deps, taskPath, 'failed', 'no billing email on file for the shipper');
      return 'failed';
    }

    await deps.mailer.sendInvoice(invoice);
    await recordInvoiceSent(deps, taskPath, job, invoice);
    return 'invoiced';
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

// The tenant's owner (falling back to a dispatcher) — invoicing and billing
// are company-level concerns, so this reads whoever is positioned to speak
// for the tenant rather than whichever member happened to post the load.
async function resolveOwnerProfile(deps: DrainDeps, tenantId: string): Promise<UserProfile | null> {
  const owners = await deps.store.query({
    collection: membersCollection(tenantId),
    filters: [
      { field: 'role', op: '==', value: 'owner' },
      { field: 'status', op: '==', value: 'active' },
    ],
    limit: 1,
  });
  let member = owners[0];
  if (member === undefined) {
    const dispatchers = await deps.store.query({
      collection: membersCollection(tenantId),
      filters: [
        { field: 'role', op: '==', value: 'dispatcher' },
        { field: 'status', op: '==', value: 'active' },
      ],
      limit: 1,
    });
    member = dispatchers[0];
  }
  if (member === undefined) return null;

  const actorId = (member.data as unknown as Member).actorId;
  const profile = await deps.store.getDoc(userProfileDoc(actorId));
  return profile === null ? null : (profile as unknown as UserProfile);
}

// Builds the invoice from the job + the two tenants' own records. Returns
// null when there's no billing email to send to at all (a hard failure —
// nothing else here is worth failing the whole invoice over, so the VAT
// number and company names all degrade gracefully instead).
async function buildInvoice(deps: DrainDeps, job: Job): Promise<InvoiceData | null> {
  const [shipperTenant, carrierTenant, shipperOwnerProfile, carrierOwnerProfile] = await Promise.all([
    deps.store.getDoc(tenantDoc(job.shipperTenantId)),
    deps.store.getDoc(tenantDoc(job.carrierTenantId)),
    resolveOwnerProfile(deps, job.shipperTenantId),
    resolveOwnerProfile(deps, job.carrierTenantId),
  ]);

  const recipientEmail = shipperOwnerProfile?.email?.trim();
  if (recipientEmail === undefined || recipientEmail === '') return null;

  const shipperCompanyName = (shipperTenant as unknown as Tenant | null)?.name ?? 'Shipper';
  const carrierCompanyName = (carrierTenant as unknown as Tenant | null)?.name ?? 'Carrier';
  const carrierVatNumber = carrierOwnerProfile?.vatNumber?.trim();

  const now = deps.now();
  const originLabel = `${job.origin.town}, ${job.origin.postcode}`;
  const destinationLabel = `${job.destination.town}, ${job.destination.postcode}`;

  return {
    invoiceNumber: buildInvoiceNumber(job.jobId),
    issuedAt: now,
    dueAt: invoiceDueDate(now),
    jobId: job.jobId,
    carrierCompanyName,
    ...(carrierVatNumber ? { carrierVatNumber } : {}),
    shipperCompanyName,
    recipientEmail,
    lineItems: [{ description: `Haulage: ${originLabel} → ${destinationLabel}`, amountGbpPence: job.priceGbpPence }],
    totalGbpPence: job.priceGbpPence,
  };
}

// Record the outcome as a system-sourced action: an append-only job event
// (the audit trail a shipper/carrier dispute would need), the task done, and
// a source:'system' audit entry — all in ONE transaction.
async function recordInvoiceSent(deps: DrainDeps, taskPath: string, job: Job, invoice: InvoiceData): Promise<void> {
  await deps.store.runTransaction(async (tx) => {
    const task = await tx.get(taskPath);
    if (task === null || task.status !== 'claimed') return; // already settled elsewhere
    const eventId = deps.newId('evt');
    tx.write({
      kind: 'create',
      path: jobEventDoc(job.jobId, eventId),
      data: {
        eventId,
        jobId: job.jobId,
        type: 'job.invoiceSent',
        at: deps.now(),
        actorId: 'system',
        source: 'system',
        detail: {
          invoiceNumber: invoice.invoiceNumber,
          recipientEmail: invoice.recipientEmail,
          totalGbpPence: invoice.totalGbpPence,
        },
      },
    });
    tx.write({ kind: 'update', path: taskPath, data: { status: 'done' } });
    tx.write(
      systemAuditOp(deps, 'sendInvoiceEmail', {
        jobId: job.jobId,
        invoiceNumber: invoice.invoiceNumber,
        recipientEmail: invoice.recipientEmail,
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
      const type = task.type as OutboxTaskType;
      const detail = type === 'sendInvoiceEmail' ? { jobId: task.jobId, lastError } : { loadId: task.loadId, lastError };
      tx.write(systemAuditOp(deps, `${type}.failed`, detail));
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
