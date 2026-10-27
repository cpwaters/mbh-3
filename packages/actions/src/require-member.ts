import { AppError, isTenantSuspended, type Member, type Role, type Tenant } from '@mbh/domain';
import { memberDoc, tenantDoc } from '@mbh/paths';
import type { TransactionContext } from '@mbh/provider-interfaces';

// Authorization inside every tenant-scoped action. The actor must be an
// ACTIVE member of the tenant with one of the allowed roles, and the tenant
// itself must not be suspended. Disabled or absent members, wrong roles and
// suspended companies are refused with a structured error.
//
// Suspension is checked HERE rather than in each action because this is the
// one door every member action already passes through: a check that has to
// be remembered per action is a check some future action forgets.
export async function requireMember(
  tx: TransactionContext,
  tenantId: string,
  actorId: string,
  allowedRoles: readonly Role[]
): Promise<Member> {
  const data = await tx.get(memberDoc(tenantId, actorId));
  if (data === null) {
    throw new AppError('forbidden', 'You are not a member of this organisation.');
  }
  const member = data as unknown as Member;
  if (member.status !== 'active') {
    throw new AppError('forbidden', 'Your membership is disabled.');
  }
  if (!allowedRoles.includes(member.role)) {
    throw new AppError('forbidden', 'Your role does not permit this action.');
  }
  const tenant = (await tx.get(tenantDoc(tenantId))) as unknown as Tenant | null;
  if (tenant !== null && isTenantSuspended(tenant)) {
    const why = tenant.suspendedReason !== undefined && tenant.suspendedReason !== '' ? ` (${tenant.suspendedReason})` : '';
    throw new AppError(
      'forbidden',
      `Your company's account is suspended${why}. Contact MyBackHaul to have it reinstated.`
    );
  }
  return member;
}
