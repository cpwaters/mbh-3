// A stable idempotency key for a capture. Generated ONCE when the driver
// commits the capture and reused across every retry, so a lost response is
// deduped server-side rather than creating a duplicate record.
export function genRequestId(): string {
  return globalThis.crypto.randomUUID();
}
