// Platform-wide feature switches the founder flips from the back office
// (Admin → Features). Each is off until switched on: a feature that is not
// ready, or not wanted yet, stays out of every screen.

export interface FeatureFlags {
  // Star ratings on driver and shipper profiles.
  ratings: boolean;
  // A Dual Operator, a company signed up as both shipper and carrier, gets
  // its own "Dual Operator" banner and one plan, Dual Operator Unlimited. Off: it is shown as a
  // carrier and offered the shipper and Driver plans, as before.
  dualOperator: boolean;
}

export type FeatureKey = keyof FeatureFlags;

export const DEFAULT_FEATURE_FLAGS: FeatureFlags = { ratings: false, dualOperator: false };

export interface FeatureInfo {
  key: FeatureKey;
  label: string;
  description: string;
}

// What the Features page lists, in order. Adding a feature means adding it to
// FeatureFlags, DEFAULT_FEATURE_FLAGS and here.
export const FEATURES: readonly FeatureInfo[] = [
  {
    key: 'ratings',
    label: 'Ratings',
    description: 'Star ratings on driver and shipper profiles. Off: no rating is shown on any profile.',
  },
  {
    key: 'dualOperator',
    label: 'Dual Operator accounts',
    description:
      'A Dual Operator is a company signed up as both shipper and carrier. On: it gets its own Dual Operator banner and one plan only, Dual Operator Unlimited (unlimited posting and pick-ups). Off: it is shown as a carrier and offered the shipper and Driver plans.',
  },
];

export const FEATURE_KEYS: readonly FeatureKey[] = FEATURES.map((f) => f.key);

// The stored switches over the defaults: a missing document, or a feature
// added since it was last saved, reads as off. Anything that isn't a feature
// or isn't true/false is ignored.
export function resolveFeatureFlags(stored: Record<string, unknown> | null | undefined): FeatureFlags {
  const flags: FeatureFlags = { ...DEFAULT_FEATURE_FLAGS };
  if (stored == null) return flags;
  for (const key of FEATURE_KEYS) {
    const value = stored[key];
    if (typeof value === 'boolean') flags[key] = value;
  }
  return flags;
}
