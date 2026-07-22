import type {
  DispatchTransport,
  QueuedRequest,
  QueueStorage,
  SendOutcome,
} from './types.js';

// In-memory test doubles for the offline ports. Exported so both the
// engine's tests and later the app's tests use the same scriptable pieces.

export class InMemoryQueueStorage implements QueueStorage {
  private items = new Map<string, QueuedRequest>();

  async put(item: QueuedRequest): Promise<void> {
    this.items.set(item.requestId, structuredClone(item));
  }
  async get(requestId: string): Promise<QueuedRequest | null> {
    const item = this.items.get(requestId);
    return item === undefined ? null : structuredClone(item);
  }
  async list(): Promise<QueuedRequest[]> {
    return [...this.items.values()]
      .sort((a, b) => (a.enqueuedAt < b.enqueuedAt ? -1 : a.enqueuedAt > b.enqueuedAt ? 1 : 0))
      .map((i) => structuredClone(i));
  }
  async delete(requestId: string): Promise<void> {
    this.items.delete(requestId);
  }
}

// A transport whose outcome per requestId is scripted. Default is 'retry'
// (as if offline) until told otherwise, so tests model losing then regaining
// signal. Records every send for assertions on idempotent resends.
export class ScriptableTransport implements DispatchTransport {
  private outcomes = new Map<string, SendOutcome>();
  private fallback: SendOutcome = { outcome: 'retry', error: 'offline' };
  readonly sends: { requestId: string; type: string }[] = [];

  setOutcome(requestId: string, outcome: SendOutcome): void {
    this.outcomes.set(requestId, outcome);
  }
  setFallback(outcome: SendOutcome): void {
    this.fallback = outcome;
  }
  async send(request: { type: string; payload: unknown; requestId: string }): Promise<SendOutcome> {
    this.sends.push({ requestId: request.requestId, type: request.type });
    return this.outcomes.get(request.requestId) ?? this.fallback;
  }
}
