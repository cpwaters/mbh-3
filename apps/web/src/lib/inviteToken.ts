// The invitation id from the link someone was sent. It has to survive the hop
// from /app/invite/<id> through signing up (a full page's worth of steps)
// to creating the company, which is where it is finally spent.
//
// sessionStorage, like the sign-up intent it sits beside: it lasts the tab and
// no longer, so a shared computer does not hand the next person a live
// invitation.
const KEY = 'mbh:invite';

export function setInviteToken(inviteId: string): void {
  try {
    sessionStorage.setItem(KEY, inviteId);
  } catch {
    /* private mode / storage disabled — the invite is then only usable in one go */
  }
}

// Read WITHOUT clearing: creating the company can fail (a name too short, a
// dropped connection) and the invitee must be able to try again. It is cleared
// only once a company actually exists.
export function peekInviteToken(): string | null {
  try {
    return sessionStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function clearInviteToken(): void {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
