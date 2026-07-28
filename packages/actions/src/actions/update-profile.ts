import { z } from 'zod';
import { AppError, validateProfileInput, type UserProfile } from '@mbh/domain';
import { userProfileDoc } from '@mbh/paths';
import type { DocData } from '@mbh/provider-interfaces';
import type { ActionHandler } from '../context.js';
import { zodParse } from '../parse.js';

// A user edits their OWN account profile. No tenant membership is required —
// the record is keyed by the actor. `set` upserts, so the first save creates
// it. Mirrors the mbh-2 prototype's rich profile.
const addressSchema = z.object({
  street: z.string(),
  town: z.string(),
  city: z.string(),
  postcode: z.string(),
});
const contactSchema = z.object({
  name: z.string(),
  email: z.string(),
  phone: z.string(),
});
const paymentTypeSchema = z.object({
  invoiced: z.boolean(),
  instantPayment: z.boolean(),
});

const updateProfileSchema = z.object({
  username: z.string(),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  email: z.string(),
  dateOfBirth: z.string(),
  companyName: z.string(),
  companyRegistrationNumber: z.string(),
  companyAddress: addressSchema,
  companyContact: contactSchema,
  vatNumber: z.string(),
  drivingLicenseNumber: z.string(),
  quantityOfVehicles: z.number().int().nonnegative(),
  paymentType: paymentTypeSchema,
  image: z.string(),
});

export type UpdateProfilePayload = z.infer<typeof updateProfileSchema>;

export interface UpdateProfileResult extends DocData {
  actorId: string;
}

export const updateProfileHandler: ActionHandler<UpdateProfilePayload, UpdateProfileResult> = {
  type: 'updateProfile',
  idempotent: true,
  parse: zodParse(updateProfileSchema),
  async execute(tx, ctx, payload) {
    const check = validateProfileInput({
      firstName: payload.firstName,
      lastName: payload.lastName,
      email: payload.email,
    });
    if (!check.ok) {
      throw new AppError('invalid-payload', check.message, { field: check.field });
    }

    // Preserve any system-assigned rating across profile edits.
    const existing = (await tx.get(userProfileDoc(ctx.actorId))) as UserProfile | null;
    const rating = existing?.rating ?? 0;

    const firstName = payload.firstName.trim();
    const lastName = payload.lastName.trim();
    const profile: UserProfile = {
      actorId: ctx.actorId,
      username: payload.username.trim(),
      firstName,
      lastName,
      email: payload.email.trim(),
      dateOfBirth: payload.dateOfBirth,
      companyName: payload.companyName.trim(),
      companyRegistrationNumber: payload.companyRegistrationNumber.trim(),
      companyAddress: payload.companyAddress,
      companyContact: payload.companyContact,
      vatNumber: payload.vatNumber.trim(),
      drivingLicenseNumber: payload.drivingLicenseNumber.trim(),
      quantityOfVehicles: payload.quantityOfVehicles,
      paymentType: payload.paymentType,
      rating,
      image: payload.image.trim(),
      displayName: `${firstName} ${lastName}`.trim(),
      updatedAt: ctx.now,
    };
    tx.write({ kind: 'set', path: userProfileDoc(ctx.actorId), data: { ...profile } });

    return { result: { actorId: ctx.actorId }, auditDetail: { actorId: ctx.actorId } };
  },
};
