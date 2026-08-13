import {
  buildInvoiceNumber,
  canTransitionJob,
  canTransitionLoad,
  invoiceDueDate,
  MAX_OUTBOX_ATTEMPTS,
  type Address,
  type InvoiceData,
  type Job,
  type JobEvidence,
  type JobStatus,
  type LoadRoute,
  type LoadStatus,
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
  jobEvidenceCollection,
  jobsCollection,
  listingDoc,
  loadDoc,
  membersCollection,
  outboxCollection,
  tenantDoc,
  userProfileDoc,
} from '@mbh/paths';
import type { DataStore, Geocoder, Mailer, MailAttachment, ObjectStorageReader, RouteProvider } from '@mbh/provider-interfaces';
import { samplePhotoPng, sampleSignaturePng } from './sample-pod-images.js';

// The scheduled drain's logic, pure of the vendor SDKs and the clock so it
// runs against the in-memory providers in CI and against Firestore + the real
// HTTP adapters in production — identical code. The function shell (functions/
// src/drain.ts) only injects the concrete providers.

export interface DrainDeps {
  store: DataStore;
  geocoder: Geocoder;
  routeProvider: RouteProvider;
  mailer: Mailer;
  objectStorage: ObjectStorageReader;
  now(): string; // ISO-8601 UTC
  newId(prefix: string): string;
}

export interface DrainSummary {
  reclaimed: number; // stale claims reset to pending
  enriched: number; // route recorded
  invoiced: number; // invoice email sent
  closed: number; // job closed + its load freed for reuse
  retried: number; // recoverable failure, left pending for the next run
  failed: number; // permanently gave up
  skipped: number; // lost the claim race / nothing to do
}

// Bound the work per invocation (the 1-minute schedule keeps draining) and the
// age past which a 'claimed' task is assumed abandoned by a crashed run.
const MAX_PER_RUN = 10;
const STALE_CLAIM_MS = 5 * 60 * 1000;

export async function runDrainOnce(deps: DrainDeps): Promise<DrainSummary> {
  const summary: DrainSummary = {
    reclaimed: 0,
    enriched: 0,
    invoiced: 0,
    closed: 0,
    retried: 0,
    failed: 0,
    skipped: 0,
  };

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

type ProcessOutcome = 'enriched' | 'invoiced' | 'closed' | 'retried' | 'failed' | 'skipped';

function processTask(deps: DrainDeps, taskPath: string, type: OutboxTaskType): Promise<ProcessOutcome> {
  if (type === 'sendInvoiceEmail') return processSendInvoiceEmail(deps, taskPath);
  if (type === 'sendTestInvoiceEmail') return processSendTestInvoiceEmail(deps, taskPath);
  if (type === 'closeJob') return processCloseJob(deps, taskPath);
  return processEnrichLoadRoute(deps, taskPath);
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
    const evidence = await loadDeliveryEvidence(deps, job.jobId);
    const invoice = await buildInvoice(deps, job, evidence);
    if (invoice === null) {
      await settle(deps, taskPath, 'failed', 'no billing email on file for the shipper');
      return 'failed';
    }

    const attachments = evidence !== null ? await buildAttachments(deps, evidence) : [];
    await deps.mailer.sendInvoice(invoice, attachments);
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

// Closes the loop: once a job has been delivered, mark it fully wrapped up
// (Job: delivered -> closed) and free its load for reuse (Load: matched ->
// fulfilled). Enqueued atomically by deliverJob alongside sendInvoiceEmail,
// but processed independently — a bounced/misconfigured invoice email is a
// billing hiccup, not a reason to leave the job/load stuck open.
async function processCloseJob(deps: DrainDeps, taskPath: string): Promise<ProcessOutcome> {
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
    await recordJobClosed(deps, taskPath, job);
    return 'closed';
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

// Debug tool: sends synthetic invoice content to the requesting actor's own
// profile email (captured on the task at enqueue time by
// sendTestInvoiceEmailHandler — never a client-supplied address at drain
// time either). Proves the SMTP config + HTML/PDF rendering pipeline end to
// end without a real delivered job. No JobEvent — there's no job to append
// one to — just the system audit entry.
async function processSendTestInvoiceEmail(deps: DrainDeps, taskPath: string): Promise<ProcessOutcome> {
  const claim = await deps.store.runTransaction(async (tx) => {
    const task = (await tx.get(taskPath)) as (OutboxTask & Record<string, unknown>) | null;
    if (task === null || task.status !== 'pending') return null; // lost the race
    tx.write({
      kind: 'update',
      path: taskPath,
      data: { status: 'claimed', claimedAt: deps.now(), attempts: task.attempts + 1 },
    });
    return { task };
  });

  if (claim === null) return 'skipped';
  const attempts = claim.task.attempts + 1;

  const recipientEmail = claim.task.recipientEmail as string | undefined;
  if (recipientEmail === undefined || recipientEmail === '') {
    await settle(deps, taskPath, 'failed', 'no recipient email on the task');
    return 'failed';
  }

  const now = deps.now();
  const invoice: InvoiceData = {
    invoiceNumber: `TEST-${deps.newId('test').toUpperCase()}`,
    issuedAt: now,
    dueAt: invoiceDueDate(now),
    jobId: 'TEST',
    carrierCompanyName: 'Test Carrier Ltd',
    shipperCompanyName: 'Test Shipper Ltd',
    recipientEmail,
    recipientName: 'Sample Recipient',
    lineItems: [{ description: 'Test invoice — MyBackHaul SMTP configuration check', amountGbpPence: 100 }],
    totalGbpPence: 100,
  };

  // Synthetic PoD images, cid'd exactly as buildAttachments() does for a real
  // delivery — so this debug tool actually renders the "Proof of delivery"
  // section rather than silently skipping it (which would make a passing
  // test email prove less about the pipeline than it appears to).
  const attachments: MailAttachment[] = [
    { filename: 'signature.png', content: sampleSignaturePng(), contentType: 'image/png', cid: 'signature' },
    { filename: 'delivery-photo-1.png', content: samplePhotoPng(), contentType: 'image/png', cid: 'photo-1' },
  ];

  try {
    await deps.mailer.sendInvoice(invoice, attachments);
    await recordTestInvoiceSent(deps, taskPath, invoice);
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

// Record the outcome as a system-sourced action: the task done and a
// source:'system' audit entry, in ONE transaction. No JobEvent — this isn't
// tied to a real Job.
async function recordTestInvoiceSent(deps: DrainDeps, taskPath: string, invoice: InvoiceData): Promise<void> {
  await deps.store.runTransaction(async (tx) => {
    const task = await tx.get(taskPath);
    if (task === null || task.status !== 'claimed') return; // already settled elsewhere
    tx.write({ kind: 'update', path: taskPath, data: { status: 'done' } });
    tx.write(
      systemAuditOp(deps, 'sendTestInvoiceEmail', {
        invoiceNumber: invoice.invoiceNumber,
        recipientEmail: invoice.recipientEmail,
      })
    );
  });
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

// The PoD evidence recorded atomically by deliverJob — null only for jobs
// that somehow reached 'delivered' without one (shouldn't happen; deliverJob
// always writes evidence + status in the same batch).
async function loadDeliveryEvidence(deps: DrainDeps, jobId: string): Promise<JobEvidence | null> {
  const rows = await deps.store.query({
    collection: jobEvidenceCollection(jobId),
    filters: [{ field: 'kind', op: '==', value: 'delivery' }],
    limit: 1,
  });
  return rows[0] === undefined ? null : (rows[0].data as unknown as JobEvidence);
}

// A signature is captured as an inline base64 data URL (see SignaturePad.tsx)
// — decode it directly, no Storage round-trip. Falls back to a real Storage
// download if it's ever not a data URL (e.g. a future migration), so this
// stays correct rather than silently dropping the attachment.
function decodeDataUrl(value: string): { content: Buffer; contentType: string } | null {
  const match = /^data:([^;]+);base64,(.+)$/s.exec(value);
  if (match === null) return null;
  // Two capturing groups in the pattern above guarantee both are present
  // whenever match is non-null — noUncheckedIndexedAccess can't see that.
  return { content: Buffer.from(match[2]!, 'base64'), contentType: match[1]! };
}

// Best-effort: a photo/signature that fails to resolve (a legacy placeholder
// ref, a transient Storage error) is silently skipped, never fails the whole
// invoice send — billing is additive, not load-bearing on evidence bytes.
// Each resolved image gets a `cid` — invoiceHtml() embeds them directly in
// the email body (the "Proof of delivery" section) using these exact ids;
// 'signature' and 'photo-N' are a contract between here and invoiceHtml().
async function buildAttachments(deps: DrainDeps, evidence: JobEvidence): Promise<MailAttachment[]> {
  const attachments: MailAttachment[] = [];

  if (evidence.signatureRef !== undefined && evidence.signatureRef !== '') {
    const inline = decodeDataUrl(evidence.signatureRef);
    if (inline !== null) {
      attachments.push({
        filename: 'signature.png',
        content: inline.content,
        contentType: inline.contentType,
        cid: 'signature',
      });
    } else {
      try {
        const content = await deps.objectStorage.download(evidence.signatureRef);
        attachments.push({ filename: 'signature.png', content, contentType: 'image/png', cid: 'signature' });
      } catch {
        // unresolvable — skip
      }
    }
  }

  for (const [index, ref] of evidence.photoRefs.entries()) {
    try {
      const content = await deps.objectStorage.download(ref);
      attachments.push({
        filename: `delivery-photo-${index + 1}.jpg`,
        content,
        contentType: 'image/jpeg',
        cid: `photo-${index + 1}`,
      });
    } catch {
      // legacy/unresolvable ref — skip
    }
  }

  return attachments;
}

// Builds the invoice from the job + the two tenants' own records. Returns
// null when there's no billing email to send to at all (a hard failure —
// nothing else here is worth failing the whole invoice over, so the VAT
// number and company names all degrade gracefully instead).
async function buildInvoice(deps: DrainDeps, job: Job, evidence: JobEvidence | null): Promise<InvoiceData | null> {
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
  const recipientName = evidence?.recipientName?.trim();

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
    ...(recipientName ? { recipientName } : {}),
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

// Record the outcome as a system-sourced action: the job closed and its load
// fulfilled (only if that transition is still legal — a replay from a
// stale-claim reclaim finds the job already 'closed' and simply leaves it
// alone, so this is safe to re-run), the task done, an append-only job
// event, and a system audit entry — all in ONE transaction.
async function recordJobClosed(deps: DrainDeps, taskPath: string, job: Job): Promise<void> {
  await deps.store.runTransaction(async (tx) => {
    const task = await tx.get(taskPath);
    if (task === null || task.status !== 'claimed') return; // already settled elsewhere
    tx.write({ kind: 'update', path: taskPath, data: { status: 'done' } });

    const currentJob = await tx.get(jobDoc(job.jobId));
    if (currentJob === null || !canTransitionJob(currentJob.status as JobStatus, 'closed')) return;
    tx.write({ kind: 'update', path: jobDoc(job.jobId), data: { status: 'closed' } });

    const eventId = deps.newId('evt');
    tx.write({
      kind: 'create',
      path: jobEventDoc(job.jobId, eventId),
      data: {
        eventId,
        jobId: job.jobId,
        type: 'job.closed',
        at: deps.now(),
        actorId: 'system',
        source: 'system',
        detail: { loadId: job.loadId },
      },
    });

    const currentLoad = await tx.get(loadDoc(job.loadId));
    if (currentLoad !== null && canTransitionLoad(currentLoad.status as LoadStatus, 'fulfilled')) {
      tx.write({ kind: 'update', path: loadDoc(job.loadId), data: { status: 'fulfilled' } });
    }

    tx.write(systemAuditOp(deps, 'closeJob', { jobId: job.jobId, loadId: job.loadId }));
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
      const detail =
        type === 'sendInvoiceEmail' || type === 'closeJob'
          ? { jobId: task.jobId, lastError }
          : type === 'sendTestInvoiceEmail'
            ? { recipientEmail: task.recipientEmail, lastError }
            : { loadId: task.loadId, lastError };
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
