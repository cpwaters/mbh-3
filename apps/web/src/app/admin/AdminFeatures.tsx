import { AlertCircle } from 'lucide-react';
import { FEATURES } from '@mbh/domain';
import { useFeatureFlags } from '../../components/useFeatureFlags';
import { useAdminAction } from './adminData';

// The founder's feature switches: each one turns a feature on or off for the
// whole platform at once. Saved through dispatch (setFeatureFlag), so every
// flip is in Activity with who did it and when.
export function AdminFeatures() {
  const { flags, loading, reload } = useFeatureFlags();
  const { run, busy, error } = useAdminAction(reload);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">Features</h2>
        <p className="text-gray-600 mt-1">
          Switch features on or off for everyone. Off means hidden from every screen, for drivers and shippers alike.
        </p>
      </div>

      {error !== null && (
        <div className="flex items-start gap-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">
          <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      <div className="bg-white rounded-2xl shadow-md border border-gray-100 divide-y divide-gray-100">
        {FEATURES.map((feature) => {
          const on = flags[feature.key];
          return (
            <div key={feature.key} className="p-5 flex flex-col sm:flex-row sm:items-center gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold text-gray-900">{feature.label}</h3>
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                      on ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'
                    }`}
                  >
                    {loading ? '…' : on ? 'On' : 'Off'}
                  </span>
                </div>
                <p className="text-sm text-gray-600 mt-1">{feature.description}</p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={on}
                aria-label={feature.label}
                disabled={loading || busy}
                onClick={() => void run('setFeatureFlag', { feature: feature.key, enabled: !on })}
                className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors disabled:opacity-60 ${
                  on ? 'bg-indigo-600' : 'bg-gray-300'
                }`}
              >
                <span
                  className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
                    on ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
