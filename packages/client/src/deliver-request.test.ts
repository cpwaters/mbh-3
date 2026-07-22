import { describe, expect, it } from 'vitest';
import { buildDeliverRequest } from './deliver-request.js';
import { genRequestId } from './request-id.js';

const validCapture = {
  carrierTenantId: 'carrier-1',
  jobId: 'job-1',
  photoRefs: ['blob://photo-1'],
  signatureRef: 'blob://sig-1',
  recipientName: 'J. Smith',
};

describe('buildDeliverRequest', () => {
  it('builds a deliverJob request from a valid capture', () => {
    const result = buildDeliverRequest(validCapture, 'req-1');
    expect(result).toEqual({ ok: true, request: { type: 'deliverJob', payload: validCapture, requestId: 'req-1' } });
  });

  it('rejects a capture with no signature, naming the field', () => {
    const result = buildDeliverRequest({ ...validCapture, signatureRef: '' }, 'req-1');
    expect(result).toEqual({ ok: false, field: 'signatureRef', message: expect.stringContaining('signature') });
  });

  it('rejects a capture with no photos', () => {
    const result = buildDeliverRequest({ ...validCapture, photoRefs: [] }, 'req-1');
    expect(result).toMatchObject({ ok: false, field: 'photoRefs' });
  });

  it('rejects a blank recipient name', () => {
    const result = buildDeliverRequest({ ...validCapture, recipientName: '   ' }, 'req-1');
    expect(result).toMatchObject({ ok: false, field: 'recipientName' });
  });
});

describe('genRequestId', () => {
  it('produces distinct uuids', () => {
    const a = genRequestId();
    const b = genRequestId();
    expect(a).not.toBe(b);
    expect(a).toMatch(/^[0-9a-f-]{36}$/);
  });
});
