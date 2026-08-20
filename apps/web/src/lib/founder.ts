import { isFounderEmail } from '@mbh/domain';

// The founder account, for the UI gate that shows the founder toolbar. The
// address itself lives in @mbh/domain so the server-side guard on
// founder-only actions (requireFounder) checks the SAME value — this is
// convenience, that is the invariant.
export { FOUNDER_EMAIL } from '@mbh/domain';

export function isFounder(session: { email: string | null } | null): boolean {
  return isFounderEmail(session?.email ?? null);
}
