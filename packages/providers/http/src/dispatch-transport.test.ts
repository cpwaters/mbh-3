import { describe, expect, it } from 'vitest';
import { HttpDispatchTransport } from './dispatch-transport.js';

function transportWith(fetchImpl: typeof fetch, token: string | null = 'tok') {
  return new HttpDispatchTransport({ getIdToken: async () => token, fetchImpl });
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

const req = { type: 'deliverJob', payload: { jobId: 'j1' }, requestId: 'r1' };

describe('HttpDispatchTransport', () => {
  it('returns ok with the result on 200 { ok: true }', async () => {
    const t = transportWith(async () => jsonResponse(200, { ok: true, result: { jobId: 'j1' } }));
    expect(await t.send(req)).toEqual({ outcome: 'ok', result: { jobId: 'j1' } });
  });

  it('sends the auth token and the request body', async () => {
    let seen: { url: string; init: RequestInit } | null = null;
    const t = transportWith(async (url, init) => {
      seen = { url: String(url), init: init as RequestInit };
      return jsonResponse(200, { ok: true, result: {} });
    });
    await t.send(req);
    expect(seen!.url).toBe('/api/dispatch');
    expect((seen!.init.headers as Record<string, string>).authorization).toBe('Bearer tok');
    expect(JSON.parse(seen!.init.body as string)).toEqual(req);
  });

  it('retries on a network failure (offline)', async () => {
    const t = transportWith(async () => {
      throw new Error('Failed to fetch');
    });
    expect(await t.send(req)).toMatchObject({ outcome: 'retry' });
  });

  it('retries on 5xx', async () => {
    const t = transportWith(async () => jsonResponse(503, { ok: false }));
    expect(await t.send(req)).toMatchObject({ outcome: 'retry', error: 'server error 503' });
  });

  it('marks a non-recoverable 4xx structured error permanent', async () => {
    const t = transportWith(async () =>
      jsonResponse(400, { ok: false, error: { code: 'invalid-payload', message: 'A recipient signature is required.', recoverable: false } })
    );
    expect(await t.send(req)).toEqual({ outcome: 'permanent', error: 'A recipient signature is required.' });
  });

  it('retries a recoverable structured error', async () => {
    const t = transportWith(async () =>
      jsonResponse(409, { ok: false, error: { code: 'conflict', message: 'try again', recoverable: true } })
    );
    expect(await t.send(req)).toMatchObject({ outcome: 'retry', error: 'try again' });
  });

  it('retries (never permanent) on an unexpected response shape', async () => {
    const t = transportWith(async () => jsonResponse(400, { totally: 'unexpected' }));
    expect(await t.send(req)).toMatchObject({ outcome: 'retry' });
  });

  it('omits the auth header when signed out', async () => {
    let headers: Record<string, string> = {};
    const t = transportWith(async (_url, init) => {
      headers = (init as RequestInit).headers as Record<string, string>;
      return jsonResponse(200, { ok: true, result: {} });
    }, null);
    await t.send(req);
    expect(headers.authorization).toBeUndefined();
  });
});
