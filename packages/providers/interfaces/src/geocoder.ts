import type { GeoPoint } from '@mbh/domain';

// Resolve a UK postcode to a coordinate. One method, injected wherever
// geocoding is needed; the real adapter (postcodes.io) and the in-memory
// mock both satisfy this. Implementations MUST return null for a
// well-formed-but-unknown postcode and throw GeocoderError only for a
// transport/parse failure the caller should retry.
export interface Geocoder {
  lookup(postcode: string): Promise<GeoPoint | null>;
}

export class GeocoderError extends Error {
  readonly recoverable: boolean;
  constructor(message: string, recoverable = true) {
    super(message);
    this.name = 'GeocoderError';
    this.recoverable = recoverable;
  }
}
