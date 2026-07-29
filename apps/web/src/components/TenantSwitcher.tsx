import type { Membership } from '@mbh/provider-interfaces';

// Lets a user who belongs to more than one tenant choose which to act as. A
// single-tenant user sees nothing (there is nothing to switch).
export function TenantSwitcher({
  tenants,
  selected,
  onSelect,
}: {
  tenants: Membership[];
  selected: Membership;
  onSelect: (tenantId: string) => void;
}) {
  if (tenants.length <= 1) return null;
  return (
    <label className="flex items-center gap-1.5 text-sm min-w-0">
      {/* "Acting as" is dropped on small screens to leave room for the select. */}
      <span className="hidden sm:inline text-gray-500 font-medium shrink-0">Acting as</span>
      <select
        value={selected.tenantId}
        onChange={(e) => onSelect(e.target.value)}
        aria-label="Acting as"
        className="min-w-0 max-w-[42vw] sm:max-w-[220px] truncate border border-gray-300 rounded-lg py-1.5 pl-2.5 pr-8 bg-white text-gray-900 font-medium outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
      >
        {tenants.map((t) => (
          <option key={t.tenantId} value={t.tenantId}>
            {t.name} ({t.capabilities.join('/')})
          </option>
        ))}
      </select>
    </label>
  );
}
