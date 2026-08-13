import type { AddressBookEntryInput } from './entities.js';

// A shipper's saved collection/delivery points. Entries are a convenience
// for the create-load form — a Load copies the address VALUES at post time,
// so editing or archiving an entry never rewrites history on loads already
// posted. Archived, never deleted, matching the fleet's ethos: an entry a
// dispatcher no longer wants offered should stop appearing, not vanish from
// under anyone mid-edit.

export type AddressBookCheck = { ok: true } | { ok: false; field: string; message: string };

// UK postcodes vary enough (and the app geocodes them anyway) that a strict
// pattern here would reject valid input; require something plausible and let
// the geocoder be the real judge, matching how postLoad treats them.
export function isPlausiblePostcode(raw: string): boolean {
  const trimmed = raw.trim();
  return trimmed.length >= 5 && trimmed.length <= 8 && /[0-9]/.test(trimmed);
}

// The saved label is what the shipper picks from the dropdown, so it is the
// one field that must be present and meaningful — everything else can be
// filled in later by editing the entry.
export function validateAddressBookEntry(input: AddressBookEntryInput): AddressBookCheck {
  if (input.label.trim() === '') {
    return { ok: false, field: 'label', message: 'Give this address a name you will recognise.' };
  }
  if (input.line1.trim() === '') {
    return { ok: false, field: 'line1', message: 'Enter the street address.' };
  }
  if (input.town.trim() === '') {
    return { ok: false, field: 'town', message: 'Enter the town or city.' };
  }
  if (!isPlausiblePostcode(input.postcode)) {
    return { ok: false, field: 'postcode', message: 'Enter a valid postcode.' };
  }
  if (input.contactEmail.trim() !== '' && !input.contactEmail.includes('@')) {
    return { ok: false, field: 'contactEmail', message: 'Enter a valid email address.' };
  }
  return { ok: true };
}

// Two entries are "the same place" when the postcode and street match, ignoring
// case and spacing — used to avoid silently stacking duplicates every time a
// shipper ticks "save to address book" for a route they run weekly.
export function addressBookKey(input: Pick<AddressBookEntryInput, 'line1' | 'postcode'>): string {
  const norm = (s: string): string => s.trim().toUpperCase().replace(/\s+/g, ' ');
  return `${norm(input.postcode)}|${norm(input.line1)}`;
}
