#!/usr/bin/env bash
# Capture documentation screenshots of the real app against the full emulator
# stack, writing PNGs into apps/web/public/guide/. Run by hand
# (pnpm docs:screenshots), NOT in CI. Restores the production web bundle after.
set -u

mkdir -p apps/web/public/guide

echo "== building emulator-flavoured web bundle =="
PUBLIC_USE_EMULATORS=true PUBLIC_FIREBASE_PROJECT_ID=demo-mbh pnpm --filter @mbh/web build || exit 1

echo "== building functions bundle =="
pnpm --filter @mbh/functions build || exit 1

echo "== capturing screenshots against the emulator stack =="
firebase emulators:exec --only auth,firestore,functions,hosting --project demo-mbh \
  'pnpm --filter @mbh/e2e exec playwright test --config screenshots.config.ts'
rc=$?

echo "== restoring the production web bundle =="
pnpm --filter @mbh/web build

exit $rc
