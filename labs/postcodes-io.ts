import { PostcodesIoGeocoder } from '@mbh/provider-postcodes-io';
import { parsePostcodesLookup } from '@mbh/wire';

// Run BY HAND (never in CI), hits the LIVE postcodes.io API (keyless):
//   pnpm --filter @mbh/labs postcodes-io
// Purpose: eyeball the real response and drift-check our wire schema against
// it — if the live shape no longer maps, this exits non-zero.

const SAMPLES = ['SW1A 1AA', 'M1 1AE', 'EH1 1RE', 'ZZ99 9ZZ'];

async function main(): Promise<void> {
  let drift = false;
  for (const postcode of SAMPLES) {
    const url = `https://api.postcodes.io/postcodes/${encodeURIComponent(postcode)}`;
    const res = await fetch(url);
    const raw: unknown = await res.json();
    const mapped = parsePostcodesLookup(raw);

    console.log(`\n${postcode}  (HTTP ${res.status})`);
    console.log('  raw:    ', JSON.stringify(raw).slice(0, 220));
    console.log('  mapped: ', JSON.stringify(mapped));

    if (!mapped.ok) {
      drift = true;
      console.error(`  ✗ DRIFT: ${mapped.message}`);
    }

    // Exercise the adapter end to end too.
    const viaAdapter = await new PostcodesIoGeocoder().lookup(postcode);
    console.log('  adapter:', JSON.stringify(viaAdapter));
  }

  if (drift) {
    console.error('\n✗ DRIFT DETECTED — @mbh/wire no longer matches live postcodes.io responses.');
    process.exit(1);
  }
  console.log('\n✓ postcodes.io wire schema matches live responses.');
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
