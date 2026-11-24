import { useEffect, useRef, useState } from 'react';
import { TriangleAlert } from 'lucide-react';
import { adrCertificateStatus, formatCalendarDate, type AdrCertificate } from '@mbh/domain';
import { genRequestId } from '@mbh/client';
import { dispatchAction } from '../lib/dispatch';

const INPUT =
  'w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent';

// The driver's ADR certificate on their profile page: whether it is in date,
// and a form right there to add, renew or remove it. ADR loads can only be
// accepted while it is in date.
export default function AdrCertificateCard({
  certificate,
  hasProfile,
  getIdToken,
  onSaved,
  onNeedProfile,
  startOpen = false,
}: {
  certificate: AdrCertificate | undefined;
  // The certificate hangs on a saved profile; without one, send them there first.
  hasProfile: boolean;
  getIdToken: () => Promise<string | null>;
  onSaved: () => void;
  onNeedProfile: () => void;
  // Arrived from an ADR load's "Add ADR certificate": open the form straight away.
  startOpen?: boolean;
}) {
  const status = adrCertificateStatus(certificate, new Date().toISOString());
  const [open, setOpen] = useState(startOpen && hasProfile);
  const [number, setNumber] = useState(certificate?.number ?? '');
  const [expiresOn, setExpiresOn] = useState(certificate?.expiresOn ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cardRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (startOpen) cardRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'center' });
  }, [startOpen]);

  function edit(): void {
    if (!hasProfile) {
      onNeedProfile();
      return;
    }
    setNumber(certificate?.number ?? '');
    setExpiresOn(certificate?.expiresOn ?? '');
    setError(null);
    setOpen(true);
  }

  async function save(adrCertificate: AdrCertificate | null): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      const res = await dispatchAction(getIdToken, 'setAdrCertificate', { adrCertificate }, genRequestId());
      if (res.ok) {
        setOpen(false);
        onSaved();
      } else {
        setError(res.error.message);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div ref={cardRef} className="md:col-span-2 rounded-lg border border-orange-200 bg-orange-50/60 p-4">
      <div className="flex flex-col sm:flex-row sm:items-start gap-3">
        <TriangleAlert className="w-5 h-5 text-orange-600 flex-shrink-0" aria-hidden="true" />
        <div className="flex-1">
          <p className="text-sm text-gray-600">ADR Certificate</p>
          {certificate === undefined || status === 'none' ? (
            <p className="font-medium text-gray-900">
              Not provided <span className="block text-xs font-normal text-gray-500">Needed to accept ADR loads.</span>
            </p>
          ) : (
            <p className="font-medium text-gray-900">
              {certificate.number}
              <span className={`block text-xs font-medium ${status === 'valid' ? 'text-green-700' : 'text-red-700'}`}>
                {status === 'valid'
                  ? `Valid until ${formatCalendarDate(certificate.expiresOn)}`
                  : `Expired on ${formatCalendarDate(certificate.expiresOn)} — ADR loads can't be accepted`}
              </span>
            </p>
          )}
        </div>
        {!open && (
          <button
            type="button"
            onClick={edit}
            className="self-start rounded-lg border border-orange-300 bg-white px-3 py-1.5 text-sm font-medium text-orange-800 hover:bg-orange-100"
          >
            {certificate === undefined ? 'Add ADR certificate' : status === 'expired' ? 'Renew' : 'Update'}
          </button>
        )}
      </div>

      {open && (
        <form
          className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            void save({ number, expiresOn });
          }}
        >
          <div>
            <label htmlFor="adr-number" className="block text-sm font-medium text-gray-700 mb-1">
              Certificate number
            </label>
            <input id="adr-number" value={number} onChange={(e) => setNumber(e.target.value)} required className={INPUT} />
          </div>
          <div>
            <label htmlFor="adr-expires" className="block text-sm font-medium text-gray-700 mb-1">
              Expiry date
            </label>
            <input
              id="adr-expires"
              type="date"
              value={expiresOn}
              onChange={(e) => setExpiresOn(e.target.value)}
              required
              className={INPUT}
            />
          </div>
          {error !== null && <p className="sm:col-span-2 text-sm text-red-700">{error}</p>}
          <div className="sm:col-span-2 flex flex-wrap gap-2">
            <button
              type="submit"
              disabled={busy}
              className="rounded-lg bg-orange-600 px-4 py-2 text-sm font-medium text-white hover:bg-orange-700 disabled:opacity-50"
            >
              {busy ? 'Saving…' : 'Save certificate'}
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              disabled={busy}
              className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Cancel
            </button>
            {certificate !== undefined && (
              <button
                type="button"
                onClick={() => void save(null)}
                disabled={busy}
                className="ml-auto rounded-lg px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50"
              >
                Remove
              </button>
            )}
          </div>
        </form>
      )}
    </div>
  );
}
