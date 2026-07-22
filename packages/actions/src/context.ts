import type { DocData, TransactionContext, WriteOp } from '@mbh/provider-interfaces';
import { auditDoc } from '@mbh/paths';

// Everything an action's effect needs beyond its payload. now and newId are
// injected so tests are deterministic and the effect stays pure of clocks
// and randomness.
export interface ActionContext {
  actorId: string;
  now: string; // ISO-8601 UTC, fixed for the whole dispatch
  newId(prefix: string): string;
}

// The value an action returns from a successful effect: the caller-visible
// result (also stored in the idempotency marker) plus what to audit.
export interface ActionExecution<Result extends DocData> {
  result: Result;
  auditDetail?: DocData;
}

// An action's effect: runs inside the pipeline's transaction, buffers its
// writes via tx.write, returns its result + audit detail. Reads and guards
// (CAS, invariants) happen here against committed state.
export interface ActionHandler<Payload, Result extends DocData> {
  type: string;
  idempotent: boolean;
  parse(input: unknown): { ok: true; payload: Payload } | { ok: false; message: string; field?: string };
  execute(tx: TransactionContext, ctx: ActionContext, payload: Payload): Promise<ActionExecution<Result>>;
}

// Audit entry — written in the SAME transaction as the effect it records.
export function buildAuditOp(ctx: ActionContext, action: string, detail: DocData | undefined): WriteOp {
  const auditId = ctx.newId('audit');
  return {
    kind: 'create',
    path: auditDoc(auditId),
    data: {
      auditId,
      action,
      actorId: ctx.actorId,
      at: ctx.now,
      source: 'member',
      ...(detail ?? {}),
    },
  };
}
