// The offline sync-queue's contracts. This is a PURE layer — no browser
// APIs, no vendor SDKs. The IndexedDB storage and the fetch transport are
// providers injected at the composition root; here we depend only on their
// interfaces so the engine is fully testable in memory.

// Honest, plain-word states. A queued item is "waiting for signal"; a failed
// item is a one-way dead end that needs a human. There is no "delivered"
// resident state — a delivered item leaves the queue.
export type QueueItemStatus = 'queued' | 'sending' | 'failed';

export interface QueuedRequest {
  requestId: string; // idempotency key AND the queue item id
  type: string; // action type
  payload: unknown;
  status: QueueItemStatus;
  attempts: number;
  enqueuedAt: string;
  lastError?: string;
}

// Persistence port (IndexedDB in the browser; in-memory in tests).
export interface QueueStorage {
  put(item: QueuedRequest): Promise<void>;
  get(requestId: string): Promise<QueuedRequest | null>;
  list(): Promise<QueuedRequest[]>; // ordered oldest-first
  delete(requestId: string): Promise<void>;
}

// The result of trying to deliver one queued request to POST /api/dispatch.
// retry = transient (offline, 5xx, network) — safe to resend the same
// requestId later (the server dedupes). permanent = a 4xx structured error
// the same request can never satisfy.
export type SendOutcome =
  | { outcome: 'ok'; result: unknown }
  | { outcome: 'retry'; error: string }
  | { outcome: 'permanent'; error: string };

// Transport port (fetch to /api/dispatch in the browser; scriptable in tests).
export interface DispatchTransport {
  send(request: { type: string; payload: unknown; requestId: string }): Promise<SendOutcome>;
}

export interface DrainSummary {
  delivered: number;
  retrying: number;
  failedPermanent: number;
}
