import { z } from 'zod';
import type { DispatchTransport, SendOutcome } from '@mbh/offline';

// The browser-side transport: POST /api/dispatch. This is the ONE place a
// vendor/browser primitive (fetch) is used to reach the server. It maps the
// HTTP response to the offline queue's SendOutcome, defaulting to "retry" on
// anything ambiguous so a captured record is never lost.

// The dispatch API's response contract (parse, never cast — even our own).
const dispatchResponseSchema = z.union([
  z.object({ ok: z.literal(true), result: z.unknown() }),
  z.object({
    ok: z.literal(false),
    error: z.object({
      code: z.string(),
      message: z.string(),
      field: z.string().optional(),
      recoverable: z.boolean(),
    }),
  }),
]);

export interface DispatchRequestBody {
  type: string;
  payload: unknown;
  requestId: string;
}

export interface HttpDispatchOptions {
  endpoint?: string;
  // Resolves the current auth token (may be null when signed out). Called per
  // send so a refreshed token is used on retry.
  getIdToken: () => Promise<string | null>;
  fetchImpl?: typeof fetch;
}

export class HttpDispatchTransport implements DispatchTransport {
  private readonly endpoint: string;
  private readonly getIdToken: () => Promise<string | null>;
  private readonly fetchImpl: typeof fetch;

  constructor(opts: HttpDispatchOptions) {
    this.endpoint = opts.endpoint ?? '/api/dispatch';
    this.getIdToken = opts.getIdToken;
    this.fetchImpl = opts.fetchImpl ?? globalThis.fetch.bind(globalThis);
  }

  async send(request: DispatchRequestBody): Promise<SendOutcome> {
    let res: Response;
    try {
      const token = await this.getIdToken();
      res = await this.fetchImpl(this.endpoint, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(token !== null ? { authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(request),
      });
    } catch (err) {
      // Network down / offline — always safe to retry the same requestId.
      return { outcome: 'retry', error: err instanceof Error ? err.message : 'network error' };
    }

    // 5xx: server hiccup, retry.
    if (res.status >= 500) {
      return { outcome: 'retry', error: `server error ${res.status}` };
    }

    let body: unknown;
    try {
      body = await res.json();
    } catch {
      // Unparseable body: don't declare permanence, retry.
      return { outcome: 'retry', error: `unreadable response ${res.status}` };
    }

    const parsed = dispatchResponseSchema.safeParse(body);
    if (!parsed.success) {
      return { outcome: 'retry', error: `unexpected response shape ${res.status}` };
    }

    if (parsed.data.ok) {
      return { outcome: 'ok', result: parsed.data.result };
    }

    // A structured error: honour its recoverable flag. Recoverable (e.g. a
    // transient auth blip) retries; everything else is permanent (a resend
    // of the same request can never satisfy it).
    return parsed.data.error.recoverable
      ? { outcome: 'retry', error: parsed.data.error.message }
      : { outcome: 'permanent', error: parsed.data.error.message };
  }
}
