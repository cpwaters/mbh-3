import { describe, expect, it } from 'vitest';
import { INVITE_TTL_DAYS, inviteExpiresAt, inviteState, inviteStateMessage, type Invite } from './invite.js';

const NOW = '2026-08-19T10:00:00.000Z';

function invite(overrides: Partial<Invite> = {}): Invite {
  return {
    inviteId: 'inv-1',
    status: 'pending',
    note: 'Waters Haulage',
    createdAt: NOW,
    createdBy: 'founder-1',
    expiresAt: inviteExpiresAt(NOW),
    ...overrides,
  };
}

describe('invite expiry', () => {
  it('lasts a week from minting', () => {
    expect(inviteExpiresAt(NOW)).toBe('2026-08-26T10:00:00.000Z');
    expect(INVITE_TTL_DAYS).toBe(7);
  });

  it('is good right up to the deadline, and not on it', () => {
    const i = invite();
    expect(inviteState(i, '2026-08-26T09:59:59.000Z')).toBe('valid');
    // Exactly at expiry counts as expired: a boundary has to fall one way,
    // and refusing is the safe direction for a credential.
    expect(inviteState(i, '2026-08-26T10:00:00.000Z')).toBe('expired');
    expect(inviteState(i, '2026-08-27T00:00:00.000Z')).toBe('expired');
  });
});

describe('inviteState', () => {
  it('is valid while pending and in date', () => {
    expect(inviteState(invite(), NOW)).toBe('valid');
  });

  it('is spent once redeemed, whatever the date', () => {
    expect(inviteState(invite({ status: 'redeemed' }), NOW)).toBe('redeemed');
  });

  it('reports a spent link as spent rather than expired', () => {
    // Both are true of this record; "already used" is the more accurate
    // answer and the less alarming one to read.
    const spentAndStale = invite({ status: 'redeemed', expiresAt: '2026-08-01T00:00:00.000Z' });
    expect(inviteState(spentAndStale, NOW)).toBe('redeemed');
  });

  it('is withdrawn once revoked', () => {
    expect(inviteState(invite({ status: 'revoked' }), NOW)).toBe('revoked');
  });

  it('explains itself in words a stranger can act on', () => {
    expect(inviteStateMessage('redeemed')).toMatch(/already been used/i);
    expect(inviteStateMessage('revoked')).toMatch(/withdrawn/i);
    expect(inviteStateMessage('expired')).toMatch(/expired/i);
    expect(inviteStateMessage('valid')).toBe('');
  });
});
