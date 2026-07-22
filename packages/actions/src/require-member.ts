import { AppError, type Member, type Role } from '@mbh/domain';
import { memberDoc } from '@mbh/paths';
import type { TransactionContext } from '@mbh/provider-interfaces';

// Authorization inside every tenant-scoped action. The actor must be an
// ACTIVE member of the tenant with one of the allowed roles. Disabled or
// absent members, and wrong roles, are refused with a structured error.
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
  return member;
}
