import type { Role } from '@mbh/domain';

// A user's own tenant memberships — how the app learns "who am I acting as".
// Accepting a load needs the carrier tenant id, and it comes from here (a
// collection-group read of the user's own member docs), never from user input.
export interface Membership {
  tenantId: string;
  role: Role;
}

export interface MembershipReader {
  membershipsFor(actorId: string): Promise<Membership[]>;
}
