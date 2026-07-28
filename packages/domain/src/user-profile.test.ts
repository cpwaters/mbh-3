import { describe, expect, it } from 'vitest';
import { isValidEmail, validateProfileInput } from './user-profile.js';

describe('user profile', () => {
  it('accepts a valid profile', () => {
    expect(validateProfileInput({ firstName: 'Chris', lastName: 'Waters', email: 'chris@example.com' })).toEqual({
      ok: true,
    });
  });

  it('validates the email', () => {
    expect(isValidEmail('a@b.com')).toBe(true);
    expect(isValidEmail('nope')).toBe(false);
    expect(isValidEmail('')).toBe(false);
  });

  it('rejects a missing name or bad email with the offending field', () => {
    expect(validateProfileInput({ firstName: '  ', lastName: 'Waters', email: 'a@b.com' })).toMatchObject({
      ok: false,
      field: 'firstName',
    });
    expect(validateProfileInput({ firstName: 'Chris', lastName: '', email: 'a@b.com' })).toMatchObject({
      ok: false,
      field: 'lastName',
    });
    expect(validateProfileInput({ firstName: 'Chris', lastName: 'Waters', email: 'bad' })).toMatchObject({
      ok: false,
      field: 'email',
    });
  });
});
