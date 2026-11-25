import { useCallback, useState } from 'react';
import { Truck, X } from 'lucide-react';
import { LOAD_VEHICLE_TYPE_LABELS, LOAD_VEHICLE_TYPES } from '@mbh/domain';

// The vehicle types a carrier has picked to filter loads by, remembered on
// this device (like the Loads near you radius). Storage can be unavailable
// (private mode, blocked site data); nothing picked stands in.
const STORAGE_KEY = 'mbh.vehicleTypeFilter';

function loadPicked(): string[] {
  try {
    const raw = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? '[]') as unknown;
    return Array.isArray(raw) ? raw.filter((t): t is string => typeof t === 'string' && LOAD_VEHICLE_TYPES.includes(t)) : [];
  } catch {
    return [];
  }
}

function savePicked(picked: readonly string[]): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(picked));
  } catch {
    /* not remembered — harmless */
  }
}

export function useVehicleTypeFilter(): { picked: string[]; setPicked: (next: string[]) => void } {
  const [picked, setState] = useState<string[]>(loadPicked);
  const setPicked = useCallback((next: string[]) => {
    setState(next);
    savePicked(next);
  }, []);
  return { picked, setPicked };
}

// Chips for the vehicle types a carrier runs. A load shows when it takes one
// of the types picked; loads that take any vehicle always show
// (matchesVehicleTypes). Nothing picked shows everything.
export function VehicleTypeFilter({
  picked,
  onChange,
  shown,
  total,
}: {
  picked: readonly string[];
  onChange: (next: string[]) => void;
  // How many loads the filter leaves, of how many — said only while it bites,
  // and only where no other count is on screen.
  shown?: number;
  total?: number;
}) {
  const toggle = (type: string) =>
    onChange(picked.includes(type) ? picked.filter((t) => t !== type) : LOAD_VEHICLE_TYPES.filter((t) => t === type || picked.includes(t)));
  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
      <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Filter by vehicle type">
        <span className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-700 mr-1">
          <Truck className="w-4 h-4 text-gray-500" aria-hidden="true" />
          Vehicle type
        </span>
        {LOAD_VEHICLE_TYPES.map((type) => {
          const on = picked.includes(type);
          return (
            <button
              key={type}
              type="button"
              aria-pressed={on}
              onClick={() => toggle(type)}
              className={`px-3 py-1.5 rounded-full text-sm font-medium border transition-colors ${
                on ? 'bg-blue-600 border-blue-600 text-white' : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'
              }`}
            >
              {LOAD_VEHICLE_TYPE_LABELS[type]}
            </button>
          );
        })}
        {picked.length > 0 && (
          <button
            type="button"
            onClick={() => onChange([])}
            className="inline-flex items-center gap-1 px-2 py-1.5 text-sm font-medium text-gray-600 hover:text-gray-900"
          >
            <X className="w-4 h-4" aria-hidden="true" />
            Clear
          </button>
        )}
      </div>
      {picked.length > 0 && (
        <p className="mt-2 text-sm text-gray-600">
          {shown !== undefined && total !== undefined
            ? `Showing ${shown} of ${total} load${total === 1 ? '' : 's'}: `
            : 'Showing loads '}
          that take your{' '}
          {picked.map((t) => LOAD_VEHICLE_TYPE_LABELS[t]?.toLowerCase() ?? t).join(' or ')}, and any that take any
          vehicle.
        </p>
      )}
    </div>
  );
}
