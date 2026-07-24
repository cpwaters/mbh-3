# labs/

Live-API validation scripts. **Run by hand, never in CI.** They hit real
third-party endpoints to (a) eyeball the actual response and (b) drift-check
`@mbh/wire` against it — if the live shape no longer maps to our schema, the
script exits non-zero and the adapter needs updating before the next release.

```bash
pnpm --filter @mbh/labs postcodes-io   # geocoding: postcodes.io (keyless)
pnpm --filter @mbh/labs osrm           # routing: OSRM demo server (rate-limited)
```

Both endpoints here are keyless. When a service needs a token or key, it comes
from the environment (never committed, never pasted into chat) — the founder
provides it out-of-band and the script reads it from `process.env`.

These are typechecked by `tsc -b` (so schema/type drift is caught at compile)
but carry no unit tests and make no network calls during `pnpm test`.
