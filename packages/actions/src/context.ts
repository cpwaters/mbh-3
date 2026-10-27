import type { DocData, TransactionContext, WriteOp } from '@mbh/provider-interfaces';
import { auditDoc } from '@mbh/paths';

// Everything an action's effect needs beyond its payload. now and newId are
// injected so tests are deterministic and the effect stays pure of clocks
// and randomness.
export interface ActionContext {
  actorId: string;
  // The address on the actor's VERIFIED token, or null if their provider gave
  // none. The only trustworthy answer to "who is this" beyond the uid — a
  // profile document is user-editable and so cannot authorize anything.
  actorEmail: string | null;
  now: string; // ISO-8601 UTC, fixed for the whole dispatch
  newId(prefix: string): string;
  // Who is acting: a signed-in member through POST /api/dispatch, or the
  // system itself (a verified payment-provider webhook). Set by the boundary
  // that called dispatch, never by anything in the request — so no member
  // can claim to be the system.
  source: ActionSource;
}

export type ActionSource = 'member' | 'system';

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
      source: ctx.source,
      ...(detail ?? {}),
    },
  };
}
