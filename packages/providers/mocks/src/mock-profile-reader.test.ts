import { describe, expect, it } from 'vitest';
import type { UserProfile } from '@mbh/domain';
import { MockProfileReader } from './mock-profile-reader.js';

const profile: UserProfile = {
  actorId: 'driver-1',
  displayName: 'Chris Waters',
  phone: '07700 900123',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

describe('MockProfileReader', () => {
  it('returns a user’s own profile, or null when none exists', async () => {
    const reader = new MockProfileReader([profile]);
    expect(await reader.profileForActor('driver-1')).toEqual(profile);
    expect(await reader.profileForActor('nobody')).toBeNull();
  });
});
