// Post-deploy production smoke: run after EVERY deploy. Verifies the live
// surface is healthy AND fails closed. Exits non-zero on any failure so a
// bad deploy is caught immediately. Base URL from SMOKE_BASE_URL.

const BASE = process.env.SMOKE_BASE_URL ?? 'https://mybackhaul-app.web.app';

interface Check {
  name: string;
  run: () => Promise<void>;
}

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(msg);
}

const checks: Check[] = [
  {
    name: 'GET /health is 200 and healthy',
    run: async () => {
      const res = await fetch(`${BASE}/health`);
      assert(res.status === 200, `expected 200, got ${res.status}`);
      const body = (await res.json()) as { ok?: boolean; status?: string };
      assert(body.ok === true && body.status === 'healthy', `unexpected body: ${JSON.stringify(body)}`);
    },
  },
  {
    name: 'POST /api/dispatch WITHOUT auth fails closed (401)',
    run: async () => {
      const res = await fetch(`${BASE}/api/dispatch`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ type: 'postLoad', requestId: 'smoke', payload: {} }),
      });
      assert(res.status === 401, `expected 401 (fail closed), got ${res.status}`);
    },
  },
  {
    name: 'Landing page 200',
    run: async () => {
      const res = await fetch(`${BASE}/`);
      assert(res.status === 200, `expected 200, got ${res.status}`);
    },
  },
  {
    name: 'Driver app page 200',
    run: async () => {
      const res = await fetch(`${BASE}/app`);
      assert(res.status === 200, `expected 200, got ${res.status}`);
    },
  },
];

async function main(): Promise<void> {
  console.log(`smoke:prod against ${BASE}`);
  let failed = 0;
  for (const check of checks) {
    try {
      await check.run();
      console.log(`  ✓ ${check.name}`);
    } catch (err) {
      failed += 1;
      console.error(`  ✗ ${check.name}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  if (failed > 0) {
    console.error(`smoke:prod FAILED (${failed} check(s))`);
    process.exit(1);
  }
  console.log('smoke:prod OK');
}

main().catch((err) => {
  console.error('smoke:prod crashed:', err);
  process.exit(1);
});
