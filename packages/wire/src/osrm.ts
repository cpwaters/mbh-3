import { z } from 'zod';
import type { RouteInfo } from '@mbh/domain';

// The wire shape of an OSRM driving-route response
// (GET /route/v1/driving/{lon,lat};{lon,lat}?overview=false). `code` is "Ok"
// on success; distance is metres and duration is seconds (floats on the wire).
const routeResponseSchema = z.object({
  code: z.string(),
  routes: z
    .array(
      z.object({
        distance: z.number().finite().nonnegative(),
        duration: z.number().finite().nonnegative(),
      })
    )
    .optional(),
});

export type OsrmRouteResponse = z.infer<typeof routeResponseSchema>;

export type OsrmRouteOutcome =
  | { ok: true; route: RouteInfo | null }
  | { ok: false; message: string };

// The ONE mapper from OSRM's wire shape to a domain RouteInfo. Metres and
// seconds are rounded to integers so stored values never carry float noise. A
// non-"Ok" code or empty routes array is a well-formed "no route" (null);
// only an unparseable body is a retryable error.
export function parseOsrmRoute(json: unknown): OsrmRouteOutcome {
  const parsed = routeResponseSchema.safeParse(json);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return {
      ok: false,
      message: `Unexpected OSRM response shape: ${first?.path.join('.') ?? ''} ${first?.message ?? 'invalid'}`.trim(),
    };
  }
  if (parsed.data.code !== 'Ok') return { ok: true, route: null };
  const first = parsed.data.routes?.[0];
  if (first === undefined) return { ok: true, route: null };
  return {
    ok: true,
    route: {
      distanceMeters: Math.round(first.distance),
      durationSeconds: Math.round(first.duration),
    },
  };
}
