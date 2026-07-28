import { useState } from 'react';
import { Building2 } from 'lucide-react';
import { genRequestId } from '@mbh/client';
import { TENANT_CAPABILITIES, TENANT_CAPABILITY_LABELS, type TenantCapability } from '@mbh/domain';
import { dispatchAction } from '../lib/dispatch';

const INPUT =
  'w-full px-3 py-2.5 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500';

// Onboarding: a user with no company creates one and becomes its owner.
// Dispatches createTenant (online); onCreated hands back the new tenant id so
// the app can refresh memberships and switch to it.
export function CreateCompany({
  getIdToken,
  onCreated,
}: {
  getIdToken: () => Promise<string | null>;
  onCreated: (tenantId: string) => void;
}) {
  const [name, setName] = useState('');
  const [caps, setCaps] = useState<TenantCapability[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggle = (c: TenantCapability) =>
    setCaps((prev) => (prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]));

  async function create(): Promise<void> {
    setError(null);
    setBusy(true);
    try {
      const res = await dispatchAction(
        getIdToken,
        'createTenant',
        { name, capabilities: caps },
        genRequestId()
      );
      if (res.ok) onCreated(res.result.tenantId as string);
      else setError(res.error.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="bg-white rounded-xl shadow-md border border-gray-200 p-6">
      <div className="flex items-center gap-3 mb-1">
        <div className="w-10 h-10 rounded-lg bg-blue-100 text-blue-600 flex items-center justify-center">
          <Building2 className="w-5 h-5" />
        </div>
        <h2 className="text-xl font-bold text-gray-900">Create your company</h2>
      </div>
      <p className="text-gray-600 mb-4">Set up your business to start posting or carrying loads.</p>

      {error !== null && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-800">{error}</div>
      )}

      <div className="space-y-4">
        <div>
          <label htmlFor="co-name" className="block text-sm font-medium text-gray-700 mb-1.5">
            Company name
          </label>
          <input
            id="co-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Waters Haulage Ltd"
            className={INPUT}
          />
        </div>

        <fieldset>
          <legend className="block text-sm font-medium text-gray-700 mb-1.5">What does your company do?</legend>
          <div className="space-y-2">
            {TENANT_CAPABILITIES.map((c) => (
              <label
                key={c}
                htmlFor={`co-cap-${c}`}
                className="flex items-center gap-3 p-3 border border-gray-200 rounded-lg cursor-pointer hover:bg-gray-50"
              >
                <input
                  id={`co-cap-${c}`}
                  type="checkbox"
                  checked={caps.includes(c)}
                  onChange={() => toggle(c)}
                  className="w-4 h-4 accent-blue-600"
                />
                <span className="text-gray-800">{TENANT_CAPABILITY_LABELS[c]}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <button
          type="button"
          disabled={busy}
          onClick={() => void create()}
          className="w-full bg-blue-600 text-white py-2.5 rounded-lg font-semibold hover:bg-blue-700 disabled:opacity-60 transition-colors"
        >
          {busy ? 'Creating…' : 'Create company'}
        </button>
      </div>
    </section>
  );
}
