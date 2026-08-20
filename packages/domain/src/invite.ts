// An invitation to join the marketplace. Signing up for an account is open,
// but creating a COMPANY — the thing that actually puts you on the
// marketplace — requires one of these. So the invite is what controls who
// trades here, and it is spent exactly once.
//
// The invite's id IS the secret in the link. It is generated at the
// composition root by randomUUID (122 bits from a CSPRNG), so it cannot be
// guessed; nothing else about the record is secret.

export type InviteStatus = 'pending' | 'redeemed' | 'revoked';

export interface Invite {
  inviteId: string;
  status: InviteStatus;
  // Free text for the founder's own benefit — who this was sent to. Never
  // shown to the person redeeming it.
  note: string;
  createdAt: string;
  createdBy: string;
  expiresAt: string;
  // Set together, when and only when status becomes 'redeemed'.
  redeemedAt?: string;
  redeemedBy?: string;
  redeemedTenantId?: string;
}

// How long a link stays good. Long enough for someone to get round to it,
// short enough that a forwarded link is not a standing key.
export const INVITE_TTL_DAYS = 7;

export function inviteExpiresAt(now: string, days: number = INVITE_TTL_DAYS): string {
  return new Date(Date.parse(now) + days * 24 * 60 * 60 * 1000).toISOString();
}

// Why a link cannot be used, or that it can. One function so the server's
// refusal and the screen's explanation can never disagree.
export type InviteState = 'valid' | 'redeemed' | 'revoked' | 'expired';

export function inviteState(
  invite: Pick<Invite, 'status' | 'expiresAt'>,
  now: string
): InviteState {
  if (invite.status === 'redeemed') return 'redeemed';
  if (invite.status === 'revoked') return 'revoked';
  // Expiry is checked after status so a spent link reads as spent rather than
  // as expired — the more accurate of the two, and the less alarming.
  if (Date.parse(invite.expiresAt) <= Date.parse(now)) return 'expired';
  return 'valid';
}

export function inviteStateMessage(state: InviteState): string {
  switch (state) {
    case 'redeemed':
      return 'This invitation has already been used.';
    case 'revoked':
      return 'This invitation has been withdrawn.';
    case 'expired':
      return 'This invitation has expired. Ask for a new one.';
    case 'valid':
      return '';
  }
}
