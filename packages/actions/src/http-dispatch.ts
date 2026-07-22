import { AppError, type ErrorCode, type StructuredError } from '@mbh/domain';
import { authenticateActor } from '@mbh/auth';
import type { AuthProvider } from '@mbh/provider-interfaces';
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
}

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
}

export async function handleHttpRequest(deps: HttpDispatchDeps, req: HttpRequest): Promise<HttpResult> {
  // Health check — no auth, no body.
  if (req.method === 'GET' && req.path === '/health') {
    return { status: 200, body: { ok: true, status: 'healthy' } };
  }

  if (req.method !== 'POST' || req.path !== '/api/dispatch') {
    return { status: 404, body: { ok: false, error: { code: 'not-found', message: 'Not found.', recoverable: false } } };
  }

  try {
    const actorId = await authenticateActor(deps.auth, bearerToken(req.authorization));

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
      actorId,
      { type, payload, ...(typeof requestId === 'string' ? { requestId } : {}) }
    );

    return { status: 200, body: { ok: true, result } };
  } catch (err) {
    return errorResult(err);
  }
}
