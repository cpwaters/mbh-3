import { useState } from 'react';
import { CheckCircle2 } from 'lucide-react';
import { genRequestId } from '@mbh/client';
import { dispatchAction } from '../lib/dispatch';

const INPUT =
  'w-full px-3 py-2.5 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500';

// Edits the user's own account profile (name + phone) via the online dispatch
// path. Seeded with the current values; calls onSaved after a successful save.
export function EditProfile({
  getIdToken,
  initialName,
  initialPhone,
  onSaved,
}: {
  getIdToken: () => Promise<string | null>;
  initialName: string;
  initialPhone: string;
  onSaved: () => void;
}) {
  const [name, setName] = useState(initialName);
  const [phone, setPhone] = useState(initialPhone);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function save(): Promise<void> {
    setError(null);
    setSaved(false);
    setBusy(true);
    try {
      const res = await dispatchAction(
        getIdToken,
        'updateProfile',
        { displayName: name, phone },
        genRequestId()
      );
      if (res.ok) {
        setSaved(true);
        onSaved();
      } else {
        setError(res.error.message);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="bg-white rounded-xl shadow-md border border-gray-200 p-6">
      <h2 className="font-bold text-gray-900 mb-3">Edit profile</h2>
      {error !== null && (
        <div className="mb-3 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-800">{error}</div>
      )}
      {saved && (
        <div className="mb-3 flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-800">
          <CheckCircle2 className="w-4 h-4" />
          Profile saved
        </div>
      )}

      <div className="space-y-3">
        <div>
          <label htmlFor="prof-name" className="block text-sm font-medium text-gray-700 mb-1.5">
            Name
          </label>
          <input
            id="prof-name"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setSaved(false);
            }}
            placeholder="Your name"
            className={INPUT}
          />
        </div>
        <div>
          <label htmlFor="prof-phone" className="block text-sm font-medium text-gray-700 mb-1.5">
            Phone
          </label>
          <input
            id="prof-phone"
            type="tel"
            value={phone}
            onChange={(e) => {
              setPhone(e.target.value);
              setSaved(false);
            }}
            placeholder="07700 900123"
            className={INPUT}
          />
        </div>
        <button
          type="button"
          disabled={busy}
          onClick={() => void save()}
          className="w-full bg-blue-600 text-white py-2.5 rounded-lg font-semibold hover:bg-blue-700 disabled:opacity-60 transition-colors"
        >
          {busy ? 'Saving…' : 'Save profile'}
        </button>
      </div>
    </section>
  );
}
