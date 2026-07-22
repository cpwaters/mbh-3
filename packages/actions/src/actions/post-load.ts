import { z } from 'zod';
import { MAX_LOAD_PRICE_GBP_PENCE, type Load, type Role } from '@mbh/domain';
import { loadDoc } from '@mbh/paths';
import type { DocData } from '@mbh/provider-interfaces';
import type { ActionHandler } from '../context.js';
import { requireMember } from '../require-member.js';
import { zodParse } from '../parse.js';

// Shippers post loads. Roles allowed to list.
const LISTING_ROLES: readonly Role[] = ['owner', 'dispatcher'];

const addressSchema = z.object({
  line1: z.string().min(1),
  town: z.string().min(1),
  postcode: z.string().min(1),
});

const postLoadSchema = z.object({
  shipperTenantId: z.string().min(1),
  origin: addressSchema,
  destination: addressSchema,
  consignment: z.object({
    description: z.string().min(1),
    weightKg: z.number().positive().finite(),
    palletCount: z.number().int().positive(),
  }),
  priceGbpPence: z.number().int().positive().max(MAX_LOAD_PRICE_GBP_PENCE),
  pickupBy: z.string().min(1),
  deliverBy: z.string().min(1),
});

export type PostLoadPayload = z.infer<typeof postLoadSchema>;

export interface PostLoadResult extends DocData {
  loadId: string;
}

export const postLoadHandler: ActionHandler<PostLoadPayload, PostLoadResult> = {
  type: 'postLoad',
  idempotent: true,
  parse: zodParse(postLoadSchema),
  async execute(tx, ctx, payload) {
    await requireMember(tx, payload.shipperTenantId, ctx.actorId, LISTING_ROLES);

    const loadId = ctx.newId('load');
    const load: Load = {
      loadId,
      tenantId: payload.shipperTenantId,
      status: 'available',
      origin: payload.origin,
      destination: payload.destination,
      consignment: payload.consignment,
      priceGbpPence: payload.priceGbpPence,
      pickupBy: payload.pickupBy,
      deliverBy: payload.deliverBy,
      createdAt: ctx.now,
    };

    tx.write({ kind: 'create', path: loadDoc(loadId), data: { ...load } });

    return { result: { loadId }, auditDetail: { loadId, tenantId: payload.shipperTenantId } };
  },
};
