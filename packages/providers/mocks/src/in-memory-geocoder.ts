import type { GeoPoint } from '@mbh/domain';
import { type Geocoder, GeocoderError } from '@mbh/provider-interfaces';

function normalize(postcode: string): string {
  return postcode.replace(/\s+/g, '').toUpperCase();
}

// Scriptable in-memory Geocoder — the CI default. Seed it with the postcodes a
// test cares about; an unseeded postcode returns null (well-formed "unknown"),
// mirroring the real adapter. `failNext` forces one retryable error so the
// drain's backoff path is testable without a network.
export class InMemoryGeocoder implements Geocoder {
  private readonly points = new Map<string, GeoPoint>();
  private failNext = false;

  constructor(seed: Record<string, GeoPoint> = {}) {
    for (const [postcode, point] of Object.entries(seed)) {
      this.points.set(normalize(postcode), point);
    }
  }

  set(postcode: string, point: GeoPoint): this {
    this.points.set(normalize(postcode), point);
    return this;
  }

  failOnce(): this {
    this.failNext = true;
    return this;
  }

  async lookup(postcode: string): Promise<GeoPoint | null> {
    if (this.failNext) {
      this.failNext = false;
      throw new GeocoderError('scripted geocoder failure');
    }
    return this.points.get(normalize(postcode)) ?? null;
  }
}
