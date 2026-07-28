// A user's own account profile: what a valid edit requires. Name is required;
// phone is optional but, when given, must look like a phone number.

export const MAX_DISPLAY_NAME_LEN = 80;

export function isValidDisplayName(name: string): boolean {
  const n = name.trim();
  return n.length >= 1 && n.length <= MAX_DISPLAY_NAME_LEN;
}

export function isValidPhone(phone: string): boolean {
  const p = phone.trim();
  if (p === '') return true; // optional
  return /^[+0-9][0-9 ()-]{4,19}$/.test(p);
}

export interface ProfileInput {
  displayName: string;
  phone: string;
}

export type ProfileCheck = { ok: true } | { ok: false; field: string; message: string };

// The domain owns what a valid profile is — the action defends beyond the
// schema with this, mirroring validateVehicleInput.
export function validateProfileInput(input: ProfileInput): ProfileCheck {
  if (!isValidDisplayName(input.displayName)) {
    return { ok: false, field: 'displayName', message: 'Enter your name.' };
  }
  if (!isValidPhone(input.phone)) {
    return { ok: false, field: 'phone', message: 'Enter a valid phone number.' };
  }
  return { ok: true };
}
