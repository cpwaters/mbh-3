import type { Invite } from '@mbh/domain';

// Reading invitations. Two very different reads, deliberately separate:
//
// - byId: the caller already knows the id, because it was in the link they
//   were sent. Knowing it is the credential.
// - forFounder: lists every invitation, to manage what has been sent. Only
//   the founder may do this — see the `list` rule on /invites.
export interface InviteReader {
  inviteById(inviteId: string): Promise<Invite | null>;
  invitesForFounder(): Promise<Invite[]>;
}
