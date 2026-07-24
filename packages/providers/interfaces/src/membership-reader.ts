import type { Role, TenantCapability } from '@mbh/domain';

// A user's own tenant memberships — how the app learns "who am I acting as".
// Carries the tenant's capabilities so the UI can show the shipper post-load
// flow and/or the carrier browse for the right tenants. Resolved from the
// user's own member docs (a collection-group read), never from user input.
export interface Membership {
  tenantId: string;
  role: Role;
  capabilities: TenantCapability[];
}

export interface MembershipReader {
  membershipsFor(actorId: string): Promise<Membership[]>;
}
