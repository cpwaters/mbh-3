import { describe, expect, it } from 'vitest';
import type { UserProfile } from '@mbh/domain';
import { MockProfileReader } from './mock-profile-reader.js';

const profile: UserProfile = {
  actorId: 'driver-1',
  username: 'chriswaters',
  firstName: 'Chris',
  lastName: 'Waters',
  email: 'chris@example.com',
  dateOfBirth: '',
  companyName: 'Waters Haulage',
  companyRegistrationNumber: '',
  companyAddress: { street: '', town: '', city: '', postcode: '' },
  companyContact: { name: '', email: '', phone: '07700 900123' },
  vatNumber: '',
  drivingLicenseNumber: '',
  quantityOfVehicles: 0,
  paymentType: { invoiced: false, instantPayment: false },
  rating: 0,
  image: '',
  displayName: 'Chris Waters',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

describe('MockProfileReader', () => {
  it('returns a user’s own profile, or null when none exists', async () => {
    const reader = new MockProfileReader([profile]);
    expect(await reader.profileForActor('driver-1')).toEqual(profile);
    expect(await reader.profileForActor('nobody')).toBeNull();
  });
});
