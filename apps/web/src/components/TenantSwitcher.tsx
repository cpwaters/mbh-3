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
    <label className="field">
      <span>Acting as</span>
      <select value={selected.tenantId} onChange={(e) => onSelect(e.target.value)}>
        {tenants.map((t) => (
          <option key={t.tenantId} value={t.tenantId}>
            {t.name} ({t.capabilities.join('/')})
          </option>
        ))}
      </select>
    </label>
  );
}
