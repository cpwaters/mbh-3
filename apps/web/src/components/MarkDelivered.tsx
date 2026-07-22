import { useState } from 'react';
import { buildDeliverRequest, genRequestId, type DeliverCapture } from '@mbh/client';
import { SignaturePad } from './SignaturePad';

export interface ActiveJob {
  jobId: string;
  carrierTenantId: string;
  origin: string;
  destination: string;
}

// The 30-second moment. Capture photo(s) + signature + recipient, then commit
// to the offline queue — succeeds instantly with no signal. onCommit enqueues
// the deliverJob request and returns; delivery is the queue's job.
export function MarkDelivered({
  job,
  onCommit,
}: {
  job: ActiveJob;
  onCommit: (requestId: string, payload: DeliverCapture) => Promise<void>;
}) {
  const [photoRefs, setPhotoRefs] = useState<string[]>([]);
  const [signatureRef, setSignatureRef] = useState<string | null>(null);
  const [recipientName, setRecipientName] = useState('');
  const [error, setError] = useState<{ field: string; message: string } | null>(null);
  const [committed, setCommitted] = useState(false);
  const [busy, setBusy] = useState(false);

  function addPhotos(files: FileList | null) {
    if (!files) return;
    // A real upload to object storage is a later slice; capture the file
    // identity as the ref for now.
    const refs = Array.from(files).map((f) => `capture://${f.name}:${f.size}`);
    setPhotoRefs((prev) => [...prev, ...refs]);
  }

  async function submit() {
    setError(null);
    const capture: DeliverCapture = {
      carrierTenantId: job.carrierTenantId,
      jobId: job.jobId,
      photoRefs,
      signatureRef: signatureRef ?? '',
      recipientName,
    };
    const built = buildDeliverRequest(capture, genRequestId());
    if (!built.ok) {
      setError({ field: built.field, message: built.message });
      return;
    }
    setBusy(true);
    try {
      await onCommit(built.request.requestId, built.request.payload);
      setCommitted(true);
    } finally {
      setBusy(false);
    }
  }

  if (committed) {
    return (
      <div className="card">
        <h2>Delivery recorded</h2>
        <p className="muted">
          Saved to this device. It will be sent to {job.destination.split(',')[0]} automatically when you have
          signal — you don't need to stay on this screen.
        </p>
      </div>
    );
  }

  const req = (field: string) =>
    error?.field === field ? <span style={{ color: '#dc2626' }}> — {error.message}</span> : null;

  return (
    <div className="card">
      <h2>Mark delivered</h2>
      <p className="muted">
        {job.origin} → {job.destination}
      </p>

      <label className="field">
        <span>
          Photos of the delivered goods <span style={{ color: '#dc2626' }}>*</span>
          {req('photoRefs')}
        </span>
        <input type="file" accept="image/*" capture="environment" multiple onChange={(e) => addPhotos(e.target.files)} />
        {photoRefs.length > 0 && <span className="muted">{photoRefs.length} photo(s) captured</span>}
      </label>

      <label className="field">
        <span>
          Recipient name <span style={{ color: '#dc2626' }}>*</span>
          {req('recipientName')}
        </span>
        <input
          type="text"
          value={recipientName}
          onChange={(e) => setRecipientName(e.target.value)}
          placeholder="Who took delivery?"
        />
      </label>

      <div className="field">
        <span>
          Recipient signature <span style={{ color: '#dc2626' }}>*</span>
          {req('signatureRef')}
        </span>
        <SignaturePad onChange={setSignatureRef} />
      </div>

      <button type="button" className="primary" onClick={submit} disabled={busy}>
        {busy ? 'Saving…' : 'Record delivery'}
      </button>
    </div>
  );
}
