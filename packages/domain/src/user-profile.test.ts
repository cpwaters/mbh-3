import { describe, expect, it } from 'vitest';
import { isValidPhone, validateProfileInput } from './user-profile.js';

describe('user profile', () => {
  it('accepts a valid profile (phone optional)', () => {
    expect(validateProfileInput({ displayName: 'Chris Waters', phone: '07700 900123' })).toEqual({ ok: true });
    expect(validateProfileInput({ displayName: 'Chris Waters', phone: '' })).toEqual({ ok: true });
  });

  it('treats an empty phone as valid but rejects a malformed one', () => {
    expect(isValidPhone('')).toBe(true);
    expect(isValidPhone('+44 7700 900123')).toBe(true);
    expect(isValidPhone('not-a-phone')).toBe(false);
  });

  it('rejects a blank name and a bad phone with the offending field', () => {
    expect(validateProfileInput({ displayName: '   ', phone: '' })).toMatchObject({
      ok: false,
      field: 'displayName',
    });
    expect(validateProfileInput({ displayName: 'Chris', phone: 'abc' })).toMatchObject({
      ok: false,
      field: 'phone',
    });
  });
});
