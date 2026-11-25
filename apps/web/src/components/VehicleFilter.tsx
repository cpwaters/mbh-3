import { useCallback, useState } from 'react';
import { Truck, X } from 'lucide-react';
import {
  LOAD_VEHICLE_SIZE_LABELS,
  LOAD_VEHICLE_SIZES,
  LOAD_VEHICLE_TYPE_LABELS,
  LOAD_VEHICLE_TYPES,
  type VehicleFilter as Filter,
} from '@mbh/domain';

// The vehicle sizes and types a carrier has picked to filter loads by,
// remembered on this device (like the Loads near you radius). Storage can be
// unavailable (private mode, blocked site data); nothing picked stands in.
const TYPES_KEY = 'mbh.vehicleTypeFilter';
const SIZES_KEY = 'mbh.vehicleSizeFilter';

function loadPicked(key: string, allowed: readonly string[]): string[] {
  try {
    const raw = JSON.parse(window.localStorage.getItem(key) ?? '[]') as unknown;
    return Array.isArray(raw) ? raw.filter((t): t is string => typeof t === 'string' && allowed.includes(t)) : [];
  } catch {
    return [];
  }
}

function savePicked(key: string, picked: readonly string[]): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(picked));
  } catch {
    /* not remembered — harmless */
  }
}

export function useVehicleFilter(): { filter: Filter; setFilter: (next: Filter) => void } {
  const [filter, setState] = useState<Filter>(() => ({
    sizes: loadPicked(SIZES_KEY, LOAD_VEHICLE_SIZES),
    types: loadPicked(TYPES_KEY, LOAD_VEHICLE_TYPES),
  }));
  const setFilter = useCallback((next: Filter) => {
    setState(next);
    savePicked(SIZES_KEY, next.sizes);
    savePicked(TYPES_KEY, next.types);
  }, []);
  return { filter, setFilter };
}

function toggled(all: readonly string[], picked: readonly string[], value: string): string[] {
  return picked.includes(value) ? picked.filter((v) => v !== value) : all.filter((v) => v === value || picked.includes(v));
}

function said(values: readonly string[], labels: Readonly<Record<string, string>>): string {
  return values.map((v) => labels[v] ?? v).join(' or ');
}

// "an artic or rigid with a refrigerated body", "a van", "a box or tanker body".
export function describeChoice(filter: Filter): string {
  const sizes = said(filter.sizes, LOAD_VEHICLE_SIZE_LABELS).toLowerCase();
  const types = said(filter.types, LOAD_VEHICLE_TYPE_LABELS).toLowerCase();
  const article = (word: string) => (/^[aeiou]/.test(word) ? 'an' : 'a');
  if (sizes !== '' && types !== '') return `${article(sizes)} ${sizes} with ${article(types)} ${types} body`;
  if (sizes !== '') return `${article(sizes)} ${sizes}`;
  return `${article(types)} ${types} body`;
}

// Chips for the vehicle sizes and types a carrier runs. A load shows when it
// suits both: one of the sizes picked (or any size) and one of the types
// picked (or any type) — matchesVehicleFilter. Nothing picked shows
// everything.
export function VehicleFilter({
  filter,
  onChange,
  shown,
  total,
}: {
  filter: Filter;
  onChange: (next: Filter) => void;
  // How many loads the filter leaves, of how many — said only while it bites,
  // and only where no other count is on screen.
  shown?: number;
  total?: number;
}) {
  const active = filter.sizes.length > 0 || filter.types.length > 0;
  const choice = describeChoice(filter);

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-gray-800">
          <Truck className="w-4 h-4 text-gray-500" aria-hidden="true" />
          Vehicle
        </span>
        {active && (
          <button
            type="button"
            onClick={() => onChange({ sizes: [], types: [] })}
            className="inline-flex items-center gap-1 px-2 py-1 text-sm font-medium text-gray-600 hover:text-gray-900"
          >
            <X className="w-4 h-4" aria-hidden="true" />
            Clear
          </button>
        )}
      </div>
      <ChipRow
        label="Size"
        values={LOAD_VEHICLE_SIZES}
        labels={LOAD_VEHICLE_SIZE_LABELS}
        picked={filter.sizes}
        onToggle={(v) => onChange({ ...filter, sizes: toggled(LOAD_VEHICLE_SIZES, filter.sizes, v) })}
      />
      <ChipRow
        label="Type"
        values={LOAD_VEHICLE_TYPES}
        labels={LOAD_VEHICLE_TYPE_LABELS}
        picked={filter.types}
        onToggle={(v) => onChange({ ...filter, types: toggled(LOAD_VEHICLE_TYPES, filter.types, v) })}
      />
      {active && (
        <p className="text-sm text-gray-600">
          {shown !== undefined && total !== undefined
            ? `Showing ${shown} of ${total} load${total === 1 ? '' : 's'}: `
            : 'Showing loads '}
          for {choice}, and any that take any vehicle.
        </p>
      )}
    </div>
  );
}

function ChipRow({
  label,
  values,
  labels,
  picked,
  onToggle,
}: {
  label: string;
  values: readonly string[];
  labels: Readonly<Record<string, string>>;
  picked: readonly string[];
  onToggle: (value: string) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2" role="group" aria-label={`Filter by vehicle ${label.toLowerCase()}`}>
      <span className="w-10 text-sm text-gray-500">{label}</span>
      {values.map((value) => {
        const on = picked.includes(value);
        return (
          <button
            key={value}
            type="button"
            aria-pressed={on}
            onClick={() => onToggle(value)}
            className={`px-3 py-1.5 rounded-full text-sm font-medium border transition-colors ${
              on ? 'bg-blue-600 border-blue-600 text-white' : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'
            }`}
          >
            {labels[value] ?? value}
          </button>
        );
      })}
    </div>
  );
}
