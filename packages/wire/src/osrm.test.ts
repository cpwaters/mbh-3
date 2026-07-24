import { describe, expect, it } from 'vitest';
import { parseOsrmRoute } from './osrm.js';

const OK = {
  code: 'Ok',
  routes: [{ distance: 12345.6, duration: 789.4, legs: [] }],
  waypoints: [{}, {}],
};
const NO_ROUTE = { code: 'NoRoute', routes: [] };

describe('parseOsrmRoute', () => {
  it('maps the first route to integer metres and seconds', () => {
    expect(parseOsrmRoute(OK)).toEqual({
      ok: true,
      route: { distanceMeters: 12346, durationSeconds: 789 },
    });
  });

  it('maps a non-Ok code to a null route (not an error)', () => {
    expect(parseOsrmRoute(NO_ROUTE)).toEqual({ ok: true, route: null });
  });

  it('maps Ok-with-empty-routes to a null route', () => {
    expect(parseOsrmRoute({ code: 'Ok', routes: [] })).toEqual({ ok: true, route: null });
  });

  it('reports an error for an unparseable body', () => {
    expect(parseOsrmRoute({ code: 'Ok', routes: [{ distance: 'far', duration: 1 }] }).ok).toBe(false);
  });

  it('reports an error when the envelope is missing', () => {
    expect(parseOsrmRoute({ nope: 1 }).ok).toBe(false);
  });
});
