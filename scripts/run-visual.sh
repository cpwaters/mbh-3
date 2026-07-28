#!/usr/bin/env bash
# Responsive / mobile visual review: build the emulator-flavoured web bundle +
# functions, run the Playwright visual suite (viewport widths + real-device
# emulation, asserting no horizontal overflow and capturing screenshots)
# against the emulator stack, then restore the production web bundle.
set -u

echo "== building emulator-flavoured web bundle =="
PUBLIC_USE_EMULATORS=true PUBLIC_FIREBASE_PROJECT_ID=demo-mbh pnpm --filter @mbh/web build || exit 1

echo "== building functions bundle =="
pnpm --filter @mbh/functions build || exit 1

echo "== running the visual review against the emulator stack =="
firebase emulators:exec --only auth,firestore,functions,hosting --project demo-mbh \
  'pnpm --filter @mbh/e2e exec playwright test --config visual.config.ts'
rc=$?

echo "== restoring the production web bundle =="
pnpm --filter @mbh/web build

exit $rc
