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
    <label className="flex items-center gap-2 text-sm">
      <span className="text-gray-500 font-medium">Acting as</span>
      <select
        value={selected.tenantId}
        onChange={(e) => onSelect(e.target.value)}
        className="border border-gray-300 rounded-lg py-1.5 pl-2.5 pr-8 bg-white text-gray-900 font-medium outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
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
