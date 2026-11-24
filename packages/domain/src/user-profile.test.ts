import { describe, expect, it } from 'vitest';
import {
  adrCertificateStatus,
  adrRefusal,
  isValidEmail,
  validateAdrCertificate,
  validateProfileInput,
} from './user-profile.js';

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

describe('ADR certificate', () => {
  const cert = { number: 'ADR-123456', expiresOn: '2027-03-12' };

  it('validates a number and a real calendar date', () => {
    expect(validateAdrCertificate(cert)).toEqual({ ok: true });
    expect(validateAdrCertificate({ ...cert, number: '  ' })).toMatchObject({ ok: false, field: 'adrCertificateNumber' });
    expect(validateAdrCertificate({ ...cert, expiresOn: '2027-02-30' })).toMatchObject({
      ok: false,
      field: 'adrCertificateExpiresOn',
    });
    expect(validateAdrCertificate({ ...cert, expiresOn: '12/03/2027' })).toMatchObject({ ok: false });
  });

  it('is valid through the end of its expiry day, UK time', () => {
    // 23:30 UTC on 12 March is still 12 March in London (GMT).
    expect(adrCertificateStatus(cert, '2027-03-12T23:30:00.000Z')).toBe('valid');
    expect(adrCertificateStatus(cert, '2027-03-13T00:00:00.000Z')).toBe('expired');
    // In summer, 23:30 UTC is already the next day in London (BST).
    const summer = { number: 'ADR-1', expiresOn: '2027-07-01' };
    expect(adrCertificateStatus(summer, '2027-07-01T22:59:00.000Z')).toBe('valid');
    expect(adrCertificateStatus(summer, '2027-07-01T23:30:00.000Z')).toBe('expired');
  });

  it('treats a missing or blank certificate as none', () => {
    expect(adrCertificateStatus(undefined, '2027-01-01T00:00:00.000Z')).toBe('none');
    expect(adrCertificateStatus({ number: '', expiresOn: '2030-01-01' }, '2027-01-01T00:00:00.000Z')).toBe('none');
  });

  it('explains a refusal in the trade’s words', () => {
    expect(adrRefusal('valid', cert)).toBeNull();
    expect(adrRefusal('none', undefined)).toMatch(/Add your ADR certificate/);
    expect(adrRefusal('expired', cert)).toMatch(/expired on 12 March 2027/);
  });
});
