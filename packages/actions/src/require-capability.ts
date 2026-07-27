import { AppError, type Tenant, type TenantCapability } from '@mbh/domain';
import { tenantDoc } from '@mbh/paths';
import type { TransactionContext } from '@mbh/provider-interfaces';

// A tenant may only take actions its capabilities permit — shippers post
// loads, carriers accept them. Enforced server-side next to the role check, so
// role alone (owner of a carrier tenant) can never post loads. The client's
// capability-aware UI is convenience; this is the invariant.
export async function requireTenantCapability(
  tx: TransactionContext,
  tenantId: string,
  capability: TenantCapability
): Promise<Tenant> {
  const data = await tx.get(tenantDoc(tenantId));
  if (data === null) {
    throw new AppError('not-found', 'That organisation no longer exists.');
  }
  const tenant = data as unknown as Tenant;
  if (!tenant.capabilities.includes(capability)) {
    throw new AppError('forbidden', `This organisation is not set up as a ${capability}.`);
  }
  return tenant;
}
