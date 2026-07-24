import { describe, expect, it } from 'vitest';
import { parsePostcodesLookup } from './postcodes-io.js';

// Fixtures mirror the real postcodes.io wire shapes. The labs/ drift-check
// script asserts the LIVE API still produces bodies these accept.
const FOUND = {
  status: 200,
  result: { postcode: 'SW1A 1AA', latitude: 51.501009, longitude: -0.141588, region: 'London' },
};
const NOT_FOUND = { status: 404, error: 'Postcode not found' };

describe('parsePostcodesLookup', () => {
  it('maps a found postcode to a GeoPoint', () => {
    const out = parsePostcodesLookup(FOUND);
    expect(out).toEqual({ ok: true, point: { lat: 51.501009, lng: -0.141588 } });
  });

  it('maps a well-formed not-found to a null point (not an error)', () => {
    expect(parsePostcodesLookup(NOT_FOUND)).toEqual({ ok: true, point: null });
  });

  it('treats a null result as not found', () => {
    expect(parsePostcodesLookup({ status: 200, result: null })).toEqual({ ok: true, point: null });
  });

  it('reports an error for an unparseable body', () => {
    const out = parsePostcodesLookup({ status: 200, result: { postcode: 'X', latitude: 'nope', longitude: 0 } });
    expect(out.ok).toBe(false);
  });

  it('reports an error when the envelope is missing', () => {
    expect(parsePostcodesLookup({ unexpected: true }).ok).toBe(false);
  });
});
