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
