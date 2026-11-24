// A user's own account profile: what a valid edit requires. Name + a well-formed
// email are required; the rest is optional. Mirrors the mbh-2 prototype's form.

export const MAX_NAME_LEN = 80;

export function isValidEmail(email: string): boolean {
  const e = email.trim();
  return e.length > 0 && e.includes('@');
}

export interface ProfileInput {
  firstName: string;
  lastName: string;
  email: string;
}

export type ProfileCheck = { ok: true } | { ok: false; field: string; message: string };

export function validateProfileInput(input: ProfileInput): ProfileCheck {
  if (input.firstName.trim() === '' || input.firstName.trim().length > MAX_NAME_LEN) {
    return { ok: false, field: 'firstName', message: 'Enter your first name.' };
  }
  if (input.lastName.trim() === '' || input.lastName.trim().length > MAX_NAME_LEN) {
    return { ok: false, field: 'lastName', message: 'Enter your surname.' };
  }
  if (!isValidEmail(input.email)) {
    return { ok: false, field: 'email', message: 'Enter a valid email address.' };
  }
  return { ok: true };
}

// ADR (dangerous goods) driver training certificate. A driver may only accept
// a load marked ADR while they hold one that has not expired. It is the
// driver's own declaration, like their licence number, and lives on their
// profile. `expiresOn` is a calendar date (YYYY-MM-DD): the certificate is
// good through the end of that day, UK time.
export interface AdrCertificate {
  number: string;
  expiresOn: string;
}

export const MAX_ADR_NUMBER_LEN = 40;

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isCalendarDate(value: string): boolean {
  const m = ISO_DATE.exec(value);
  if (m === null) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(Date.UTC(y, mo - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === mo - 1 && date.getUTCDate() === d;
}

export function validateAdrCertificate(input: AdrCertificate): ProfileCheck {
  const number = input.number.trim();
  if (number === '' || number.length > MAX_ADR_NUMBER_LEN) {
    return { ok: false, field: 'adrCertificateNumber', message: 'Enter your ADR certificate number.' };
  }
  if (!isCalendarDate(input.expiresOn)) {
    return { ok: false, field: 'adrCertificateExpiresOn', message: 'Enter the date your ADR certificate expires.' };
  }
  return { ok: true };
}

// Today's date in the UK, as YYYY-MM-DD.
export function ukDate(nowIso: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/London',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(nowIso));
}

export type AdrStatus = 'valid' | 'expired' | 'none';

export function adrCertificateStatus(cert: AdrCertificate | undefined | null, nowIso: string): AdrStatus {
  if (cert == null || cert.number.trim() === '' || !isCalendarDate(cert.expiresOn)) return 'none';
  return cert.expiresOn >= ukDate(nowIso) ? 'valid' : 'expired';
}

// "12 March 2027", for messages and the profile page.
export function formatCalendarDate(value: string): string {
  if (!isCalendarDate(value)) return value;
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(
    new Date(`${value}T00:00:00Z`)
  );
}

// Why a driver can't take an ADR load, in the trade's words; null when they can.
export function adrRefusal(status: AdrStatus, cert: AdrCertificate | undefined | null): string | null {
  if (status === 'valid') return null;
  if (status === 'expired' && cert != null) {
    return `This is an ADR load. Your ADR certificate expired on ${formatCalendarDate(cert.expiresOn)} — update it in your profile to accept ADR loads.`;
  }
  return 'This is an ADR load. Add your ADR certificate to your profile to accept it.';
}
