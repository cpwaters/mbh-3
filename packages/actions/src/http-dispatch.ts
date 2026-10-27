import { AppError, type ErrorCode, type StructuredError } from '@mbh/domain';
import { authenticateActor } from '@mbh/auth';
import type { AuthProvider, BillingWebhook } from '@mbh/provider-interfaces';
import { dispatch, type AnyHandler, type DispatchDeps } from './pipeline.js';

// The HTTP boundary of the one mutation path — the exact logic the dispatch
// Cloud Function runs, expressed as a pure function of an HTTP-ish request so
// it is fully testable against the mocks with no functions runtime. The
// Cloud Function is a thin adapter (firebase onRequest -> this -> res).

export interface HttpRequest {
  method: string;
  path: string;
  authorization?: string; // the Authorization header value, if any
  body: unknown;
  // The body exactly as received — a webhook signature is over these bytes,
  // not over whatever re-serialising the parsed body would produce.
  rawBody?: string;
  // The payment provider's signature header (Stripe-Signature), if any.
  webhookSignature?: string;
}

// Where Stripe is told to send its webhooks (hosting rewrites /api/** here).
export const BILLING_WEBHOOK_PATH = '/api/billing/webhook';

// The system's identity on the audit log for what a payment provider told us.
// Never a Firebase uid (those are random 28-character strings), and never
// reachable from POST /api/dispatch, which only ever acts as a member.
export const BILLING_SYSTEM_ACTOR = { actorId: 'system:billing', email: null } as const;

export interface HttpResult {
  status: number;
  body: Record<string, unknown>;
}

const STATUS_FOR_CODE: Record<ErrorCode, number> = {
  'invalid-payload': 400,
  unauthenticated: 401,
  forbidden: 403,
  'not-found': 404,
  conflict: 409,
  'request-conflict': 409,
  internal: 500,
};

function bearerToken(authorization: string | undefined): string | undefined {
  if (authorization === undefined) return undefined;
  const match = /^Bearer (.+)$/.exec(authorization.trim());
  return match?.[1];
}

function errorResult(err: unknown): HttpResult {
  if (err instanceof AppError) {
    const structured: StructuredError = err.toStructured();
    return { status: STATUS_FOR_CODE[err.code], body: { ok: false, error: structured } };
  }
  // Never leak an internal error's details.
  return {
    status: 500,
    body: { ok: false, error: { code: 'internal', message: 'Something went wrong.', recoverable: true } },
  };
}

export interface HttpDispatchDeps {
  store: DispatchDeps['store'];
  auth: AuthProvider;
  registry: ReadonlyMap<string, AnyHandler>;
  now(): string;
  newId(prefix: string): string;
  // null until the signing secret exists — and then the webhook refuses
  // everything rather than trusting unsigned bodies.
  billingWebhook?: BillingWebhook | null;
}

const failure = (status: number, code: string, message: string): HttpResult => ({
  status,
  body: { ok: false, error: { code, message, recoverable: false } },
});

// A payment provider's webhook, received and recorded through the Action
// Layer as a SYSTEM action. Status codes matter here: the provider retries
// anything but a 2xx, so a genuine event we failed to record must get a 5xx,
// and a forged or meaningless one a 4xx it will eventually give up on.
async function handleBillingWebhook(deps: HttpDispatchDeps, req: HttpRequest): Promise<HttpResult> {
  const webhook = deps.billingWebhook ?? null;
  if (webhook === null) {
    return failure(503, 'unavailable', 'Billing is not configured.');
  }
  if (req.rawBody === undefined) {
    return failure(400, 'invalid-payload', 'No body.');
  }
  const nowSeconds = Math.floor(Date.parse(deps.now()) / 1000);
  const outcome = webhook.receive(req.rawBody, req.webhookSignature, nowSeconds);
  if (outcome.kind === 'rejected') return failure(400, 'unauthenticated', 'Signature verification failed.');
  if (outcome.kind === 'malformed') return failure(400, 'invalid-payload', outcome.message);
  if (outcome.kind === 'ignored') return { status: 200, body: { ok: true, ignored: outcome.reason } };

  try {
    const result = await dispatch(
      { store: deps.store, now: deps.now(), newId: deps.newId, source: 'system' },
      deps.registry,
      BILLING_SYSTEM_ACTOR,
      // The provider's event id IS the idempotency key: a redelivery is
      // answered from the marker, never applied twice.
      { type: 'recordBillingEvent', payload: outcome.event, requestId: `billing-${outcome.event.eventId}` }
    );
    return { status: 200, body: { ok: true, result } };
  } catch (err) {
    return errorResult(err);
  }
}

export async function handleHttpRequest(deps: HttpDispatchDeps, req: HttpRequest): Promise<HttpResult> {
  // Health check — no auth, no body.
  if (req.method === 'GET' && req.path === '/health') {
    return { status: 200, body: { ok: true, status: 'healthy' } };
  }

  if (req.method === 'POST' && req.path === BILLING_WEBHOOK_PATH) {
    return handleBillingWebhook(deps, req);
  }

  if (req.method !== 'POST' || req.path !== '/api/dispatch') {
    return { status: 404, body: { ok: false, error: { code: 'not-found', message: 'Not found.', recoverable: false } } };
  }

  try {
    const actor = await authenticateActor(deps.auth, bearerToken(req.authorization));

    const body = req.body;
    if (typeof body !== 'object' || body === null) {
      throw new AppError('invalid-payload', 'Request body must be an object.');
    }
    const { type, payload, requestId } = body as { type?: unknown; payload?: unknown; requestId?: unknown };
    if (typeof type !== 'string') {
      throw new AppError('invalid-payload', 'An action type is required.', { field: 'type' });
    }

    const result = await dispatch(
      { store: deps.store, now: deps.now(), newId: deps.newId },
      deps.registry,
      actor,
      { type, payload, ...(typeof requestId === 'string' ? { requestId } : {}) }
    );

    return { status: 200, body: { ok: true, result } };
  } catch (err) {
    return errorResult(err);
  }
}
