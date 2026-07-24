import type { GeoPoint } from '@mbh/domain';
import { type Geocoder, GeocoderError } from '@mbh/provider-interfaces';
import { parsePostcodesLookup } from '@mbh/wire';

// A minimal structural view of the HTTP response we consume, so this adapter
// depends on neither lib.dom nor a specific fetch implementation and is
// trivial to fake in tests.
export interface HttpResponse {
  status: number;
  json(): Promise<unknown>;
}
export type FetchLike = (url: string) => Promise<HttpResponse>;

export interface PostcodesIoOptions {
  baseUrl?: string;
  fetch?: FetchLike;
}

// The ONLY place the postcodes.io HTTP endpoint is called. No API key needed
// (postcodes.io is free/keyless). Shape validation + the domain mapping live
// in @mbh/wire; this adapter is just transport + error classification.
export class PostcodesIoGeocoder implements Geocoder {
  private readonly baseUrl: string;
  private readonly doFetch: FetchLike;

  constructor(options: PostcodesIoOptions = {}) {
    this.baseUrl = (options.baseUrl ?? 'https://api.postcodes.io').replace(/\/+$/, '');
    this.doFetch = options.fetch ?? ((url) => fetch(url));
  }

  async lookup(postcode: string): Promise<GeoPoint | null> {
    const url = `${this.baseUrl}/postcodes/${encodeURIComponent(postcode.trim())}`;

    let res: HttpResponse;
    try {
      res = await this.doFetch(url);
    } catch (cause) {
      throw new GeocoderError(`postcodes.io request failed: ${String(cause)}`);
    }

    // 404 is a well-formed "not found" that still carries a JSON envelope the
    // mapper turns into a null point. Anything else non-200 is unexpected;
    // 429/5xx are worth retrying, other 4xx are not.
    if (res.status !== 200 && res.status !== 404) {
      throw new GeocoderError(
        `postcodes.io returned HTTP ${res.status}`,
        res.status === 429 || res.status >= 500
      );
    }

    let json: unknown;
    try {
      json = await res.json();
    } catch (cause) {
      throw new GeocoderError(`postcodes.io response was not JSON: ${String(cause)}`);
    }

    const out = parsePostcodesLookup(json);
    if (!out.ok) throw new GeocoderError(out.message, false);
    return out.point;
  }
}
