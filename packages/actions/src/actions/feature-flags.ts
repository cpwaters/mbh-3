import { z } from 'zod';
import { FEATURE_KEYS, resolveFeatureFlags, type FeatureKey } from '@mbh/domain';
import { featureFlagsDoc } from '@mbh/paths';
import type { DocData } from '@mbh/provider-interfaces';
import type { ActionHandler } from '../context.js';
import { requireFounder } from '../require-founder.js';
import { zodParse } from '../parse.js';

const setFeatureFlagSchema = z.object({
  feature: z.enum(FEATURE_KEYS as [FeatureKey, ...FeatureKey[]]),
  enabled: z.boolean(),
});

export type SetFeatureFlagPayload = z.infer<typeof setFeatureFlagSchema>;

export interface SetFeatureFlagResult extends DocData {
  feature: FeatureKey;
  enabled: boolean;
}

// The founder flips one feature on or off for the whole platform. One switch
// per call, read-modify-write in the transaction, so two switches flipped
// close together can't undo each other.
export const setFeatureFlagHandler: ActionHandler<SetFeatureFlagPayload, SetFeatureFlagResult> = {
  type: 'setFeatureFlag',
  idempotent: true,
  parse: zodParse(setFeatureFlagSchema),
  async execute(tx, ctx, payload) {
    requireFounder(ctx);
    const current = resolveFeatureFlags(await tx.get(featureFlagsDoc()));
    tx.write({
      kind: 'set',
      path: featureFlagsDoc(),
      data: { ...current, [payload.feature]: payload.enabled, updatedAt: ctx.now },
    });
    return {
      result: { feature: payload.feature, enabled: payload.enabled },
      auditDetail: { feature: payload.feature, enabled: payload.enabled },
    };
  },
};
