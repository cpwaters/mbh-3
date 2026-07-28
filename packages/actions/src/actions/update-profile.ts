import { z } from 'zod';
import { AppError, validateProfileInput, type UserProfile } from '@mbh/domain';
import { userProfileDoc } from '@mbh/paths';
import type { DocData } from '@mbh/provider-interfaces';
import type { ActionHandler } from '../context.js';
import { zodParse } from '../parse.js';

// A user edits their OWN account profile. No tenant membership is required —
// the record is keyed by the actor, so a signed-in user always acts on their
// own. `set` upserts, so the first save creates it.
const updateProfileSchema = z.object({
  displayName: z.string().min(1),
  phone: z.string(), // may be empty; the client always sends it
});

export type UpdateProfilePayload = z.infer<typeof updateProfileSchema>;

export interface UpdateProfileResult extends DocData {
  actorId: string;
}

export const updateProfileHandler: ActionHandler<UpdateProfilePayload, UpdateProfileResult> = {
  type: 'updateProfile',
  idempotent: true,
  parse: zodParse(updateProfileSchema),
  async execute(tx, ctx, payload) {
    const check = validateProfileInput({ displayName: payload.displayName, phone: payload.phone });
    if (!check.ok) {
      throw new AppError('invalid-payload', check.message, { field: check.field });
    }

    const profile: UserProfile = {
      actorId: ctx.actorId,
      displayName: payload.displayName.trim(),
      phone: payload.phone.trim(),
      updatedAt: ctx.now,
    };
    tx.write({ kind: 'set', path: userProfileDoc(ctx.actorId), data: { ...profile } });

    return { result: { actorId: ctx.actorId }, auditDetail: { actorId: ctx.actorId } };
  },
};
