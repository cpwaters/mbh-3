// The founder account. Used in two places that must never disagree: the
// server-side guard on founder-only actions (checked against the VERIFIED
// token email, never anything the client sends), and the UI gate that shows
// the founder toolbar.
export const FOUNDER_EMAIL = 'nvwebdevelopers@gmail.com';

export function isFounderEmail(email: string | null | undefined): boolean {
  return (email ?? '').trim().toLowerCase() === FOUNDER_EMAIL;
}
