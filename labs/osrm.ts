import { OsrmRouteProvider } from '@mbh/provider-osrm';
import { parseOsrmRoute } from '@mbh/wire';
import type { GeoPoint } from '@mbh/domain';

// Run BY HAND (never in CI), hits the LIVE OSRM demo server:
//   pnpm --filter @mbh/labs osrm
// Purpose: eyeball the real response and drift-check our wire schema. Note the
// public demo server (router.project-osrm.org) is rate-limited and not for
// production traffic — the drain will point at a hosted/self-run OSRM.

const LONDON: GeoPoint = { lat: 51.501009, lng: -0.141588 };
const MANCHESTER: GeoPoint = { lat: 53.47913, lng: -2.24455 };
const EDINBURGH: GeoPoint = { lat: 55.95271, lng: -3.18827 };

const LEGS: Array<[string, GeoPoint, GeoPoint]> = [
  ['London → Manchester', LONDON, MANCHESTER],
  ['Manchester → Edinburgh', MANCHESTER, EDINBURGH],
];

async function main(): Promise<void> {
  let drift = false;
  for (const [label, from, to] of LEGS) {
    const url = `https://router.project-osrm.org/route/v1/driving/${from.lng},${from.lat};${to.lng},${to.lat}?overview=false`;
    const res = await fetch(url);
    const raw: unknown = await res.json();
    const mapped = parseOsrmRoute(raw);

    console.log(`\n${label}  (HTTP ${res.status})`);
    console.log('  raw:    ', JSON.stringify(raw).slice(0, 220));
    console.log('  mapped: ', JSON.stringify(mapped));

    if (!mapped.ok) {
      drift = true;
      console.error(`  ✗ DRIFT: ${mapped.message}`);
    }

    const viaAdapter = await new OsrmRouteProvider().drivingRoute(from, to);
    console.log('  adapter:', JSON.stringify(viaAdapter));
  }

  if (drift) {
    console.error('\n✗ DRIFT DETECTED — @mbh/wire no longer matches live OSRM responses.');
    process.exit(1);
  }
  console.log('\n✓ OSRM wire schema matches live responses.');
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
