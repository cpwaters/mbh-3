import { useEffect, useState } from 'react';
import { Image as ImageIcon, Trash2, Upload } from 'lucide-react';
import { genRequestId } from '@mbh/client';
import {
  LOGO_CONTENT_TYPES,
  LOGO_CONTENT_TYPE_LABEL,
  companyLogoStoragePath,
  validateCompanyLogo,
} from '@mbh/domain';
import { useApp } from './context';
import { dispatchAction } from '../lib/dispatch';
import { getObjectStorageUploader } from '../lib/object-storage';

// A company's own logo, which letterheads the invoices it issues. Shown on
// the profile of both sides of the marketplace — a shipper and a carrier both
// have a company, and both may want their own mark on paperwork.
//
// The bytes go straight to object storage and only the ref goes through the
// Action Layer. That is deliberate and not a shortcut around "one mutation
// path": what has to be authorized and audited is which object IS the
// company's logo, and that is the part dispatch owns. Unlike a PoD capture
// this is a desk job with signal, so it does not go through the offline
// queue — a failed upload is simply reported and retried by hand.
export default function CompanyLogo({ tenantId }: { tenantId: string }) {
  const app = useApp();
  const selected = app.selected;
  const logoRef = selected?.tenantId === tenantId ? (selected.logoRef ?? '') : '';

  const [url, setUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Resolve the stored ref to something the browser can render. Re-runs when
  // the ref changes, so an upload swaps the preview without a reload.
  useEffect(() => {
    if (logoRef === '') {
      setUrl(null);
      return;
    }
    let cancelled = false;
    getObjectStorageUploader()
      .viewUrl(logoRef)
      .then((resolved) => {
        if (!cancelled) setUrl(resolved);
      })
      .catch(() => {
        // The record says there is a logo but the object will not resolve.
        // Show the empty state rather than a broken image.
        if (!cancelled) setUrl(null);
      });
    return () => {
      cancelled = true;
    };
  }, [logoRef]);

  async function onFile(file: File): Promise<void> {
    setError(null);

    // The same rules the server will apply, checked here so the person gets
    // told before anything is uploaded.
    const check = validateCompanyLogo({ contentType: file.type, sizeBytes: file.size });
    if (!check.ok) {
      setError(check.message);
      return;
    }

    setBusy(true);
    const requestId = genRequestId();
    const ref = companyLogoStoragePath(tenantId, requestId, file.type);
    try {
      await getObjectStorageUploader().upload(ref, file, file.type);
    } catch {
      setBusy(false);
      setError('Could not upload that image. Check your connection and try again.');
      return;
    }

    const res = await dispatchAction(
      app.auth.getIdToken,
      'setCompanyLogo',
      { tenantId, logoRef: ref, contentType: file.type },
      requestId
    );
    setBusy(false);
    if (!res.ok) {
      setError(res.error.message);
      return;
    }
    app.reloadTenants();
  }

  async function remove(): Promise<void> {
    setBusy(true);
    setError(null);
    const res = await dispatchAction(app.auth.getIdToken, 'clearCompanyLogo', { tenantId }, genRequestId());
    setBusy(false);
    if (!res.ok) {
      setError(res.error.message);
      return;
    }
    app.reloadTenants();
  }

  return (
    <div className="bg-white rounded-2xl shadow-md border border-gray-100 p-6">
      <div className="flex items-center gap-2 mb-1">
        <ImageIcon className="w-5 h-5 text-blue-600" />
        <h2 className="text-lg font-bold text-gray-900">Company Logo</h2>
      </div>
      <p className="text-sm text-gray-600 mb-4">
        Goes on the invoices you send. Without one, they carry the MyBackHaul logo.
      </p>

      {error !== null && (
        <div role="alert" className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-sm text-red-800">{error}</p>
        </div>
      )}

      <div className="flex flex-col sm:flex-row sm:items-center gap-4">
        <div className="w-32 h-32 shrink-0 rounded-lg border border-gray-200 bg-gray-50 flex items-center justify-center overflow-hidden">
          {url !== null ? (
            <img src={url} alt="Your company logo" className="max-w-full max-h-full object-contain" />
          ) : (
            <span className="text-xs text-gray-400 text-center px-2">No logo yet</span>
          )}
        </div>

        <div className="flex flex-col gap-2 items-start">
          <label
            htmlFor="company-logo-file"
            className={`inline-flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg font-medium transition-colors ${
              busy ? 'opacity-60 pointer-events-none' : 'hover:bg-blue-700 cursor-pointer'
            }`}
          >
            <Upload className="w-4 h-4" />
            {busy ? 'Saving…' : url !== null ? 'Replace logo' : 'Upload logo'}
          </label>
          <input
            id="company-logo-file"
            type="file"
            disabled={busy}
            accept={LOGO_CONTENT_TYPES.join(',')}
            className="sr-only"
            onChange={(e) => {
              const file = e.target.files?.[0];
              // Clear the input so choosing the same file twice still fires.
              e.target.value = '';
              if (file !== undefined) void onFile(file);
            }}
          />

          {url !== null && (
            <button
              type="button"
              disabled={busy}
              onClick={() => void remove()}
              className="inline-flex items-center gap-2 text-sm text-gray-600 hover:text-red-700 disabled:opacity-60"
            >
              <Trash2 className="w-4 h-4" />
              Remove
            </button>
          )}

          <p className="text-xs text-gray-500">{LOGO_CONTENT_TYPE_LABEL}, up to 2MB.</p>
        </div>
      </div>
    </div>
  );
}
