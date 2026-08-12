// Outbound work items. The ONLY place third-party delivery is triggered is the
// scheduled drain, which walks these, claims each with a status CAS, calls the
// provider, and records the outcome as a system-sourced action. Keeping the
// work as records (not fire-and-forget calls in the request path) is what makes
// external effects retriable, auditable, and offline-safe.

export type OutboxTaskType = 'enrichLoadRoute' | 'sendInvoiceEmail' | 'sendTestInvoiceEmail' | 'closeJob';

// pending  -> eligible for the drain to claim
// claimed  -> a drain run holds it (crash-safe: reclaimed if the claim goes stale)
// done     -> the outcome was recorded
// failed   -> permanently gave up (unknown postcode, no route, or attempts spent)
export type OutboxStatus = 'pending' | 'claimed' | 'done' | 'failed';

export interface OutboxTask {
  taskId: string;
  type: OutboxTaskType;
  status: OutboxStatus;
  tenantId: string; // denormalized owning tenant
  loadId?: string; // enrichLoadRoute: the load this task enriches
  jobId?: string; // sendInvoiceEmail / closeJob: the job this task acts on
  recipientEmail?: string; // sendTestInvoiceEmail: where to send the test (the requester's own profile email, captured at enqueue time)
  actorId?: string; // sendTestInvoiceEmail: who requested it — the ONLY outbox task type a client may ever read back (its own), so the founder toolbar can show whether the send actually succeeded instead of a permanent "Queued" with no outcome
  attempts: number;
  createdAt: string;
  claimedAt?: string;
  lastError?: string;
}

// Give up after this many attempts. The 1-minute drain schedule IS the retry
// cadence, so this bounds a persistently-failing task to a few minutes.
export const MAX_OUTBOX_ATTEMPTS = 5;
