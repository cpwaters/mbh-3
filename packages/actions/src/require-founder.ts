import { AppError, isFounderEmail } from '@mbh/domain';
import type { ActionContext } from './context.js';

// Some actions are the founder's alone — minting an invitation to the
// marketplace is one, since whoever can mint decides who trades here.
//
// This checks the address on the VERIFIED token, threaded through from the
// dispatch boundary. It deliberately does NOT read the actor's profile
// document: a member can edit their own profile, so a profile email would let
// anyone promote themselves. The client-side isFounder() that shows the
// founder toolbar is convenience only; this is the invariant.
export function requireFounder(ctx: ActionContext): void {
  if (!isFounderEmail(ctx.actorEmail)) {
    throw new AppError('forbidden', 'Your role does not permit this action.');
  }
}
