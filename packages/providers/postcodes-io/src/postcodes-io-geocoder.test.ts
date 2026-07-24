import { describe, expect, it } from 'vitest';
import { GeocoderError } from '@mbh/provider-interfaces';
import { PostcodesIoGeocoder, type FetchLike } from './index.js';

function fakeFetch(status: number, body: unknown): { fetch: FetchLike; calls: string[] } {
  const calls: string[] = [];
  const fetch: FetchLike = async (url) => {
    calls.push(url);
    return { status, json: async () => body };
  };
  return { fetch, calls };
}

describe('PostcodesIoGeocoder', () => {
  it('maps a 200 lookup to a GeoPoint and hits the right URL', async () => {
    const { fetch, calls } = fakeFetch(200, {
      status: 200,
      result: { postcode: 'SW1A 1AA', latitude: 51.501, longitude: -0.1416 },
    });
    const geo = new PostcodesIoGeocoder({ baseUrl: 'https://x.test/', fetch });
    expect(await geo.lookup('sw1a 1aa')).toEqual({ lat: 51.501, lng: -0.1416 });
    expect(calls[0]).toBe('https://x.test/postcodes/sw1a%201aa');
  });

  it('returns null on a 404 not-found body', async () => {
    const { fetch } = fakeFetch(404, { status: 404, error: 'Postcode not found' });
    expect(await new PostcodesIoGeocoder({ fetch }).lookup('ZZ99 9ZZ')).toBeNull();
  });

  it('throws a retryable error on 5xx', async () => {
    const { fetch } = fakeFetch(503, {});
    await expect(new PostcodesIoGeocoder({ fetch }).lookup('SW1A 1AA')).rejects.toMatchObject({
      recoverable: true,
    });
  });

  it('throws a non-retryable error on an unparseable 200 body', async () => {
    const { fetch } = fakeFetch(200, { status: 200, result: { postcode: 'X', latitude: 'no' } });
    await expect(new PostcodesIoGeocoder({ fetch }).lookup('X')).rejects.toBeInstanceOf(
      GeocoderError
    );
  });
});
