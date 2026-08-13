import { describe, expect, it } from 'vitest';
import { addressBookKey, isPlausiblePostcode, validateAddressBookEntry } from './address-book.js';
import type { AddressBookEntryInput } from './entities.js';

function entry(overrides: Partial<AddressBookEntryInput> = {}): AddressBookEntryInput {
  return {
    label: 'Tesco Trafford DC',
    companyName: 'Tesco Distribution',
    line1: '10 Distribution Way',
    town: 'Trafford',
    postcode: 'M17 1WS',
    contactName: 'John Smith',
    contactEmail: 'john@tesco.test',
    contactPhone: '0161 234 5678',
    ...overrides,
  };
}

describe('validateAddressBookEntry', () => {
  it('accepts a complete entry', () => {
    expect(validateAddressBookEntry(entry())).toEqual({ ok: true });
  });

  it('requires a label — it is what the shipper picks by', () => {
    expect(validateAddressBookEntry(entry({ label: '   ' }))).toMatchObject({ ok: false, field: 'label' });
  });

  it('requires street, town and a plausible postcode', () => {
    expect(validateAddressBookEntry(entry({ line1: '' }))).toMatchObject({ ok: false, field: 'line1' });
    expect(validateAddressBookEntry(entry({ town: '' }))).toMatchObject({ ok: false, field: 'town' });
    expect(validateAddressBookEntry(entry({ postcode: 'nope' }))).toMatchObject({ ok: false, field: 'postcode' });
  });

  it('allows blank contact details but rejects a malformed email', () => {
    expect(validateAddressBookEntry(entry({ contactName: '', contactEmail: '', contactPhone: '' }))).toEqual({
      ok: true,
    });
    expect(validateAddressBookEntry(entry({ contactEmail: 'not-an-email' }))).toMatchObject({
      ok: false,
      field: 'contactEmail',
    });
  });
});

describe('isPlausiblePostcode', () => {
  it('accepts real UK shapes and rejects obvious rubbish', () => {
    for (const ok of ['M17 1WS', 'EH6 6JJ', 'BS11 8DL', 'CF104UW']) {
      expect(isPlausiblePostcode(ok)).toBe(true);
    }
    for (const bad of ['', 'M17', 'Trafford', 'ABCDEFGH']) {
      expect(isPlausiblePostcode(bad)).toBe(false);
    }
  });
});

describe('addressBookKey', () => {
  it('treats the same place written differently as one key', () => {
    const a = addressBookKey({ line1: '10 Distribution Way', postcode: 'M17 1WS' });
    const b = addressBookKey({ line1: '10  distribution way ', postcode: ' m17 1ws' });
    expect(a).toBe(b);
  });

  it('keeps genuinely different places apart', () => {
    const a = addressBookKey({ line1: '10 Distribution Way', postcode: 'M17 1WS' });
    expect(a).not.toBe(addressBookKey({ line1: '11 Distribution Way', postcode: 'M17 1WS' }));
    expect(a).not.toBe(addressBookKey({ line1: '10 Distribution Way', postcode: 'EH6 6JJ' }));
  });
});
