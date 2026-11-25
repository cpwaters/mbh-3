import type { FeatureFlags } from '@mbh/domain';

// The platform's feature switches (Admin → Features). Any signed-in user may
// read them; a missing document reads as every feature off.
export interface FeatureReader {
  featureFlags(): Promise<FeatureFlags>;
}
