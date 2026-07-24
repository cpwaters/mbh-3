import { z } from 'zod';
import type { GeoPoint } from '@mbh/domain';

// The wire shape of a postcodes.io single-postcode lookup
// (GET https://api.postcodes.io/postcodes/{postcode}). We validate only the
// fields we consume; a 404 body carries no `result`, so it is optional/nullable.
// The labs/ drift-check script asserts the LIVE response still matches this.
const lookupResponseSchema = z.object({
  status: z.number(),
  result: z
    .object({
      postcode: z.string(),
      latitude: z.number().finite(),
      longitude: z.number().finite(),
    })
    .nullish(),
});

export type PostcodesLookupResponse = z.infer<typeof lookupResponseSchema>;

export type PostcodesLookupOutcome =
  | { ok: true; point: GeoPoint | null }
  | { ok: false; message: string };

// The ONE mapper from postcodes.io's wire shape to a domain GeoPoint. A
// well-formed "not found" (status !== 200 or missing result) maps to a null
// point; only an unparseable body is an error the caller should retry.
export function parsePostcodesLookup(json: unknown): PostcodesLookupOutcome {
  const parsed = lookupResponseSchema.safeParse(json);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return {
      ok: false,
      message: `Unexpected postcodes.io response shape: ${first?.path.join('.') ?? ''} ${first?.message ?? 'invalid'}`.trim(),
    };
  }
  const { status, result } = parsed.data;
  if (status !== 200 || result === null || result === undefined) {
    return { ok: true, point: null };
  }
  return { ok: true, point: { lat: result.latitude, lng: result.longitude } };
}
