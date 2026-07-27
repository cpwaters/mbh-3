import { useState } from 'react';
import { CheckCircle2, MapPin } from 'lucide-react';
import { buildDeliverRequest, genRequestId, type DeliverCapture } from '@mbh/client';
import { SignaturePad } from './SignaturePad';

export interface ActiveJob {
  jobId: string;
  carrierTenantId: string;
  origin: string;
  destination: string;
}

// The 30-second moment. Capture photo(s) + signature + recipient, then commit
// to the offline queue — succeeds instantly with no signal.
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
      <div className="bg-white rounded-xl shadow-md border border-green-200 p-6 text-center">
        <CheckCircle2 className="w-10 h-10 text-green-600 mx-auto mb-2" />
        <h2 className="text-xl font-bold text-gray-900 mb-1">Delivery recorded</h2>
        <p className="text-gray-600">
          Saved to this device. It will be sent to {job.destination.split(',')[0]} automatically when
          you have signal — you don't need to stay on this screen.
        </p>
      </div>
    );
  }

  const req = (field: string) =>
    error?.field === field ? <span className="text-red-600 font-normal"> — {error.message}</span> : null;
  const star = <span className="text-red-500">*</span>;
  const labelCls = 'block text-sm font-semibold text-gray-800 mb-1.5';
  const input =
    'w-full px-3 py-2.5 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500';

  return (
    <section className="bg-white rounded-xl shadow-md border border-gray-200 p-6">
      <h2 className="text-xl font-bold text-gray-900 mb-1">Mark delivered</h2>
      <p className="flex items-center gap-1.5 text-sm text-gray-500 mb-5">
        <MapPin className="w-4 h-4 text-gray-400" />
        {job.origin} → {job.destination}
      </p>

      <div className="space-y-5">
        <div>
          <span className={labelCls}>
            Photos of the delivered goods {star}
            {req('photoRefs')}
          </span>
          <input
            type="file"
            accept="image/*"
            capture="environment"
            multiple
            onChange={(e) => addPhotos(e.target.files)}
            className="w-full text-sm text-gray-600 border border-dashed border-gray-300 rounded-lg p-2.5 bg-gray-50 file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:bg-blue-600 file:text-white file:font-semibold file:text-sm"
          />
          {photoRefs.length > 0 && (
            <p className="text-sm text-green-600 mt-1.5">{photoRefs.length} photo(s) captured</p>
          )}
        </div>

        <div>
          <label htmlFor="recipient" className={labelCls}>
            Recipient name {star}
            {req('recipientName')}
          </label>
          <input
            id="recipient"
            type="text"
            value={recipientName}
            onChange={(e) => setRecipientName(e.target.value)}
            placeholder="Who took delivery?"
            className={input}
          />
        </div>

        <div>
          <span className={labelCls}>
            Recipient signature {star}
            {req('signatureRef')}
          </span>
          <SignaturePad onChange={setSignatureRef} />
        </div>

        <button
          type="button"
          onClick={submit}
          disabled={busy}
          className="w-full bg-blue-600 text-white py-3 rounded-lg font-semibold hover:bg-blue-700 disabled:opacity-60 transition-colors"
        >
          {busy ? 'Saving…' : 'Record delivery'}
        </button>
      </div>
    </section>
  );
}
