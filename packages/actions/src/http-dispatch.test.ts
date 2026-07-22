import { describe, expect, it } from 'vitest';
import { InMemoryDataStore, MockAuthProvider } from '@mbh/provider-mocks';
import { buildRegistry } from './registry.js';
import { handleHttpRequest, type HttpDispatchDeps, type HttpRequest } from './http-dispatch.js';

function makeIdGen(): (p: string) => string {
  const c = new Map<string, number>();
  return (p) => `${p}-${(c.set(p, (c.get(p) ?? 0) + 1), c.get(p))}`;
}

async function makeApi(): Promise<{ deps: HttpDispatchDeps; call: (req: HttpRequest) => ReturnType<typeof handleHttpRequest> }> {
  const store = new InMemoryDataStore();
  const auth = new MockAuthProvider();
  auth.grant('owner-token', 'ship-owner');
  await store.runBatch([
    { kind: 'create', path: 'tenants/shipper-1', data: { tenantId: 'shipper-1', name: 'Acme', capabilities: ['shipper'] } },
    { kind: 'create', path: 'tenants/shipper-1/members/ship-owner', data: { tenantId: 'shipper-1', actorId: 'ship-owner', role: 'owner', status: 'active', displayName: 'Owner' } },
  ]);
  const deps: HttpDispatchDeps = {
    store,
    auth,
    registry: buildRegistry(),
    now: () => '2026-08-01T09:00:00.000Z',
    newId: makeIdGen(),
  };
  return { deps, call: (req) => handleHttpRequest(deps, req) };
}

const validPostLoad = {
  type: 'postLoad',
  requestId: 'req-1',
  payload: {
    shipperTenantId: 'shipper-1',
    origin: { line1: '1 A', town: 'T', postcode: 'M17 1WS' },
    destination: { line1: '2 B', town: 'U', postcode: 'EH6 6JJ' },
    consignment: { description: 'x', weightKg: 100, palletCount: 2 },
    priceGbpPence: 5000,
    pickupBy: '2026-08-02',
    deliverBy: '2026-08-03',
  },
};

describe('handleHttpRequest', () => {
  it('answers /health without auth', async () => {
    const { call } = await makeApi();
    expect(await call({ method: 'GET', path: '/health', body: null })).toEqual({
      status: 200,
      body: { ok: true, status: 'healthy' },
    });
  });

  it('404s an unknown route', async () => {
    const { call } = await makeApi();
    const res = await call({ method: 'GET', path: '/nope', body: null });
    expect(res.status).toBe(404);
  });

  it('401s a POST with no token', async () => {
    const { call } = await makeApi();
    const res = await call({ method: 'POST', path: '/api/dispatch', body: validPostLoad });
    expect(res.status).toBe(401);
    expect(res.body).toMatchObject({ ok: false, error: { code: 'unauthenticated' } });
  });

  it('401s a bad token', async () => {
    const { call } = await makeApi();
    const res = await call({ method: 'POST', path: '/api/dispatch', authorization: 'Bearer nope', body: validPostLoad });
    expect(res.status).toBe(401);
  });

  it('dispatches an authenticated action and returns ok + result', async () => {
    const { call } = await makeApi();
    const res = await call({ method: 'POST', path: '/api/dispatch', authorization: 'Bearer owner-token', body: validPostLoad });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, result: { loadId: 'load-1' } });
  });

  it('maps a forbidden action to 403', async () => {
    const { deps, call } = await makeApi();
    (deps.auth as MockAuthProvider).grant('stranger-token', 'stranger');
    const res = await call({ method: 'POST', path: '/api/dispatch', authorization: 'Bearer stranger-token', body: validPostLoad });
    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ ok: false, error: { code: 'forbidden' } });
  });

  it('maps a bad payload to 400 with the offending field', async () => {
    const { call } = await makeApi();
    const bad = { ...validPostLoad, requestId: 'req-2', payload: { ...validPostLoad.payload, priceGbpPence: -1 } };
    const res = await call({ method: 'POST', path: '/api/dispatch', authorization: 'Bearer owner-token', body: bad });
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ ok: false, error: { code: 'invalid-payload', field: 'priceGbpPence' } });
  });

  it('requires an action type', async () => {
    const { call } = await makeApi();
    const res = await call({ method: 'POST', path: '/api/dispatch', authorization: 'Bearer owner-token', body: { payload: {} } });
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ ok: false, error: { field: 'type' } });
  });

  it('returns the same shape the HttpDispatchTransport parses (ok + result | error)', async () => {
    const { call } = await makeApi();
    const ok = await call({ method: 'POST', path: '/api/dispatch', authorization: 'Bearer owner-token', body: validPostLoad });
    expect(ok.body).toHaveProperty('ok', true);
    expect(ok.body).toHaveProperty('result');
    const err = await call({ method: 'POST', path: '/api/dispatch', body: validPostLoad });
    expect(err.body).toHaveProperty('ok', false);
    expect(err.body.error).toMatchObject({ code: expect.any(String), message: expect.any(String), recoverable: expect.any(Boolean) });
  });
});
