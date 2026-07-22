// Evidence records — the append-only legal artifacts a job accrues. A
// delivery evidence record is the Proof of Delivery: it and the status
// change it justifies commit in ONE atomic batch (the atomic legal event).
// Evidence is created once and never edited; a correction is a new record.

export type EvidenceKind = 'collection' | 'delivery';

export interface JobEvidence {
  evidenceId: string;
  jobId: string;
  kind: EvidenceKind;
  // Storage references to uploaded images (photos / signature). Binary lives
  // in object storage; the record holds refs, not bytes.
  photoRefs: string[];
  signatureRef?: string;
  recipientName?: string;
  capturedAt: string;
  location?: { lat: number; lng: number };
  actorId: string;
}

// A Proof of Delivery must name a recipient, carry a signature, and include
// at least one photo. Collection evidence is lighter (photos only).
export function validateDeliveryEvidence(input: {
  photoRefs: string[];
  signatureRef?: string;
  recipientName?: string;
}): { ok: true } | { ok: false; field: string; message: string } {
  if (input.photoRefs.length === 0) {
    return { ok: false, field: 'photoRefs', message: 'At least one delivery photo is required.' };
  }
  if (input.signatureRef === undefined || input.signatureRef.length === 0) {
    return { ok: false, field: 'signatureRef', message: 'A recipient signature is required.' };
  }
  if (input.recipientName === undefined || input.recipientName.trim().length === 0) {
    return { ok: false, field: 'recipientName', message: 'The recipient name is required.' };
  }
  return { ok: true };
}
