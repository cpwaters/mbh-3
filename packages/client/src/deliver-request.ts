import { validateDeliveryEvidence } from '@mbh/domain';

// Pure client-side construction of a deliverJob dispatch request. Same domain
// validation the server applies, run at the point of capture so the driver
// hears about a missing signature immediately — not after a queued round
// trip. The request that comes out is exactly what gets enqueued.

export interface DeliverCapture {
  carrierTenantId: string;
  jobId: string;
  photoRefs: string[];
  signatureRef: string;
  recipientName: string;
  location?: { lat: number; lng: number };
}

export interface DeliverRequest {
  type: 'deliverJob';
  payload: DeliverCapture;
  requestId: string;
}

export type BuildResult =
  | { ok: true; request: DeliverRequest }
  | { ok: false; field: string; message: string };

export function buildDeliverRequest(capture: DeliverCapture, requestId: string): BuildResult {
  const check = validateDeliveryEvidence(capture);
  if (!check.ok) {
    return { ok: false, field: check.field, message: check.message };
  }
  return { ok: true, request: { type: 'deliverJob', payload: capture, requestId } };
}
