#!/usr/bin/env bash
# Full-stack E2E: build the emulator-flavoured web bundle + the functions
# bundle, run Playwright against the auth+firestore+functions+hosting emulators,
# then ALWAYS rebuild the production web bundle so a later deploy can never ship
# the emulator-flavoured one.
set -u

echo "== building emulator-flavoured web bundle =="
PUBLIC_USE_EMULATORS=true PUBLIC_FIREBASE_PROJECT_ID=demo-mbh pnpm --filter @mbh/web build || exit 1

echo "== building functions bundle =="
pnpm --filter @mbh/functions build || exit 1

echo "== running E2E against the emulator stack =="
firebase emulators:exec --only auth,firestore,functions,hosting --project demo-mbh \
  'pnpm --filter @mbh/e2e test'
rc=$?

echo "== restoring the production web bundle =="
pnpm --filter @mbh/web build

exit $rc
