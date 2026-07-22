import { AppError } from '@mbh/domain';
import { requestMarkerDoc } from '@mbh/paths';
import type { DataStore, DocData } from '@mbh/provider-interfaces';
import { buildAuditOp, type ActionContext, type ActionHandler } from './context.js';

export interface DispatchRequest {
  type: string;
  payload: unknown;
  requestId?: string;
}

export interface DispatchDeps {
  store: DataStore;
  now: string;
  newId(prefix: string): string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyHandler = ActionHandler<any, DocData>;

// The one mutation path. Resolve the handler → validate payload → run the
// effect, audit entry, and idempotency marker in ONE transaction. The actor
// is passed in already resolved from the auth token (never from the payload).
export async function dispatch(
  deps: DispatchDeps,
  registry: ReadonlyMap<string, AnyHandler>,
  actorId: string,
  request: DispatchRequest
): Promise<DocData> {
  const handler = registry.get(request.type);
  if (handler === undefined) {
    throw new AppError('not-found', `Unknown action: ${request.type}`);
  }

  const parsed = handler.parse(request.payload);
  if (!parsed.ok) {
    throw new AppError('invalid-payload', parsed.message, {
      ...(parsed.field !== undefined ? { field: parsed.field } : {}),
    });
  }

  if (handler.idempotent && (request.requestId === undefined || request.requestId.length === 0)) {
    throw new AppError('invalid-payload', 'A requestId is required for this action.', {
      field: 'requestId',
    });
  }

  const ctx: ActionContext = { actorId, now: deps.now, newId: deps.newId };

  return deps.store.runTransaction(async (tx) => {
    // Idempotency: a replayed requestId returns the ORIGINAL result; a
    // requestId reused by a DIFFERENT action type is refused.
    if (handler.idempotent && request.requestId !== undefined) {
      const marker = await tx.get(requestMarkerDoc(request.requestId));
      if (marker !== null) {
        if (marker.actionType !== handler.type) {
          throw new AppError(
            'request-conflict',
            'This request id was already used for a different action.',
            { field: 'requestId' }
          );
        }
        return marker.result as DocData;
      }
    }

    const execution = await handler.execute(tx, ctx, parsed.payload);

    tx.write(buildAuditOp(ctx, handler.type, execution.auditDetail));

    if (handler.idempotent && request.requestId !== undefined) {
      tx.write({
        kind: 'create',
        path: requestMarkerDoc(request.requestId),
        data: {
          requestId: request.requestId,
          actionType: handler.type,
          actorId,
          at: deps.now,
          result: execution.result,
        },
      });
    }

    return execution.result;
  });
}
