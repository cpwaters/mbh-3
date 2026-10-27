import type { Job, Load, Member, Tenant } from '@mbh/domain';

// The founder's back office: reads across EVERY company. Rules-gated by
// isFounder() on the token's email (firestore.rules); to anyone else each of
// these is refused by the store, not merely hidden by the UI.
//
// Whole-collection lists, deliberately unordered where an order would need an
// index the emulator cannot vouch for — the back office sorts and filters in
// memory. Bounded by ADMIN_LIST_LIMIT so one page load cannot read a
// runaway collection; at that size a cursor belongs here instead.

export const ADMIN_LIST_LIMIT = 2000;

// Who a member is, beyond the display name on their membership: the contact
// details from their own profile. Absent fields are those they never filled.
export interface AdminPerson {
  actorId: string;
  displayName: string;
  email: string;
  phone: string;
}

// One entry of the audit log: what was done, by whom, when, with the
// action's own detail (ids, names, reasons) alongside.
export interface AdminActivity {
  auditId: string;
  action: string;
  actorId: string;
  at: string;
  source: string;
  detail: Record<string, unknown>;
}

export interface AdminReader {
  adminCompanies(): Promise<Tenant[]>;
  // Every membership of every company — one person may appear under several.
  adminMembers(): Promise<Member[]>;
  adminPeople(): Promise<AdminPerson[]>;
  adminLoads(): Promise<Load[]>;
  adminJobs(): Promise<Job[]>;
  // Newest first.
  adminActivity(max: number): Promise<AdminActivity[]>;
}
