import { AppError } from '@mbh/domain';
import type { ActionContext } from './context.js';

// Some records only the system may write — a payment provider's verdict on a
// subscription is one. The boundary sets ctx.source (POST /api/dispatch is
// always 'member'), so a signed-in user, the founder included, is refused
// here however the request is dressed up.
export function requireSystem(ctx: ActionContext): void {
  if (ctx.source !== 'system') {
    throw new AppError('forbidden', 'Your role does not permit this action.');
  }
}
