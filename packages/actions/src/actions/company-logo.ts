import { z } from 'zod';
import {
  AppError,
  LOGO_CONTENT_TYPES,
  LOGO_CONTENT_TYPE_LABEL,
  isCompanyLogoRefFor,
  type Role,
} from '@mbh/domain';
import { tenantDoc } from '@mbh/paths';
import type { DocData } from '@mbh/provider-interfaces';
import type { ActionHandler } from '../context.js';
import { requireMember } from '../require-member.js';
import { zodParse } from '../parse.js';

// A company's logo, letterheading the invoices it issues. Any active member
// may set it, matching the fleet and invitation actions — a one-truck
// owner-driver is their own admin, and gating branding behind a role they do
// not hold would just mean nobody sets it.
const LOGO_ROLES: readonly Role[] = ['owner', 'dispatcher', 'driver'];

// The bytes are already in object storage by the time this runs: the client
// uploads, then dispatches this with the ref. Only the record of WHICH
// object is the company's logo goes through the Action Layer, which is the
// part that has to be authorized and audited.
const setCompanyLogoSchema = z.object({
  tenantId: z.string().min(1),
  logoRef: z.string().min(1),
  contentType: z.string().min(1),
});

export type SetCompanyLogoPayload = z.infer<typeof setCompanyLogoSchema>;

export interface SetCompanyLogoResult extends DocData {
  logoRef: string;
}

export const setCompanyLogoHandler: ActionHandler<SetCompanyLogoPayload, SetCompanyLogoResult> = {
  type: 'setCompanyLogo',
  idempotent: true,
  parse: zodParse(setCompanyLogoSchema),
  async execute(tx, ctx, payload) {
    await requireMember(tx, payload.tenantId, ctx.actorId, LOGO_ROLES);

    if (!LOGO_CONTENT_TYPES.includes(payload.contentType)) {
      throw new AppError('invalid-payload', `Choose a ${LOGO_CONTENT_TYPE_LABEL} image.`, {
        field: 'contentType',
      });
    }

    // The storage rule already confines a member to their own tenant's
    // folder, but this record is what the drain later downloads and puts on
    // an invoice — so check here too rather than trusting the client to send
    // back a ref it was supposed to have written.
    if (!isCompanyLogoRefFor(payload.tenantId, payload.logoRef)) {
      throw new AppError('forbidden', 'That logo does not belong to this company.', { field: 'logoRef' });
    }

    const tenant = await tx.get(tenantDoc(payload.tenantId));
    if (tenant === null) {
      throw new AppError('not-found', 'That company no longer exists.');
    }

    tx.write({
      kind: 'update',
      path: tenantDoc(payload.tenantId),
      data: { logoRef: payload.logoRef, logoContentType: payload.contentType },
    });

    return {
      result: { logoRef: payload.logoRef },
      auditDetail: { tenantId: payload.tenantId, logoRef: payload.logoRef, contentType: payload.contentType },
    };
  },
};

const clearCompanyLogoSchema = z.object({
  tenantId: z.string().min(1),
});

export type ClearCompanyLogoPayload = z.infer<typeof clearCompanyLogoSchema>;

export const clearCompanyLogoHandler: ActionHandler<ClearCompanyLogoPayload, DocData> = {
  type: 'clearCompanyLogo',
  idempotent: true,
  parse: zodParse(clearCompanyLogoSchema),
  async execute(tx, ctx, payload) {
    await requireMember(tx, payload.tenantId, ctx.actorId, LOGO_ROLES);

    const tenant = await tx.get(tenantDoc(payload.tenantId));
    if (tenant === null) {
      throw new AppError('not-found', 'That company no longer exists.');
    }

    // Emptied rather than deleted: the record of record is append-only in
    // spirit, and an empty string reads the same everywhere as "no logo" —
    // the invoice falls back to the MyBackHaul mark. The object itself is
    // left in storage; nothing points at it any more.
    tx.write({
      kind: 'update',
      path: tenantDoc(payload.tenantId),
      data: { logoRef: '', logoContentType: '' },
    });

    return { result: {}, auditDetail: { tenantId: payload.tenantId } };
  },
};
