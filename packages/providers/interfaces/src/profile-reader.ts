import type { UserProfile } from '@mbh/domain';

// A user's read of their OWN account profile. Business reads go directly to the
// store (rules-gated), so this is a client-side READ interface.
export interface ProfileReader {
  // The user's profile, or null if they have not saved one yet.
  profileForActor(actorId: string): Promise<UserProfile | null>;
}
