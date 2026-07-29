// The founder account. When signed in as this user, the app shows an extra
// founder nav bar for jumping to the public site and the carrier/shipper
// sign-up pages. Kept as a single source of truth so the check is consistent.
export const FOUNDER_EMAIL = 'nvwebdevelopers@gmail.com';

export function isFounder(session: { email: string | null } | null): boolean {
  return (session?.email ?? '').trim().toLowerCase() === FOUNDER_EMAIL;
}
