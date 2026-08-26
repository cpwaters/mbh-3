import type { Role, TenantCapability } from '@mbh/domain';

// A user's own tenant memberships — how the app learns "who am I acting as".
// Carries the tenant's capabilities so the UI can show the shipper post-load
// flow and/or the carrier browse for the right tenants. Resolved from the
// user's own member docs (a collection-group read), never from user input.
export interface Membership {
  tenantId: string;
  name: string;
  role: Role;
  capabilities: TenantCapability[];
  // The company's logo, when it has set one. Carried here because reading a
  // membership already reads the tenant document for its name and
  // capabilities — the profile screen would otherwise re-read it just for
  // this.
  logoRef?: string;
  logoContentType?: string;
}

export interface MembershipReader {
  membershipsFor(actorId: string): Promise<Membership[]>;
}
