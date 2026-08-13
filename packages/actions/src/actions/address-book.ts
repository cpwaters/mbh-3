import { z } from 'zod';
import {
  AppError,
  addressBookKey,
  validateAddressBookEntry,
  type AddressBookEntry,
  type AddressBookEntryInput,
  type Role,
} from '@mbh/domain';
import { addressBookCollection, addressBookEntryDoc } from '@mbh/paths';
import type { DocData } from '@mbh/provider-interfaces';
import type { ActionHandler } from '../context.js';
import { requireMember } from '../require-member.js';
import { requireTenantCapability } from '../require-capability.js';
import { zodParse } from '../parse.js';

// A shipper's saved collection/delivery points. Whoever can post a load can
// curate the addresses that load form offers — drivers cannot.
const ADDRESS_BOOK_ROLES: readonly Role[] = ['owner', 'dispatcher'];

const entryFields = {
  label: z.string().min(1),
  companyName: z.string(),
  line1: z.string().min(1),
  town: z.string().min(1),
  postcode: z.string().min(1),
  contactName: z.string(),
  contactEmail: z.string(),
  contactPhone: z.string(),
};

const saveAddressBookEntrySchema = z.object({
  shipperTenantId: z.string().min(1),
  ...entryFields,
});

export type SaveAddressBookEntryPayload = z.infer<typeof saveAddressBookEntrySchema>;

export interface SaveAddressBookEntryResult extends DocData {
  entryId: string;
  created: boolean; // false when an existing entry at the same place was reused
}

function inputFrom(payload: SaveAddressBookEntryPayload | UpdateAddressBookEntryPayload): AddressBookEntryInput {
  return {
    label: payload.label.trim(),
    companyName: payload.companyName.trim(),
    line1: payload.line1.trim(),
    town: payload.town.trim(),
    postcode: payload.postcode.trim(),
    contactName: payload.contactName.trim(),
    contactEmail: payload.contactEmail.trim(),
    contactPhone: payload.contactPhone.trim(),
  };
}

function guard(input: AddressBookEntryInput): void {
  const check = validateAddressBookEntry(input);
  if (!check.ok) {
    throw new AppError('invalid-payload', check.message, { field: check.field });
  }
}

// Saving the same place twice is the expected case, not an error: a shipper
// ticking "save to address book" on a route they run weekly should not stack
// duplicates. An existing ACTIVE entry at the same postcode+street wins and is
// returned as-is; an archived one is deliberately left alone (it was archived
// on purpose) and a fresh entry is created alongside it.
export const saveAddressBookEntryHandler: ActionHandler<
  SaveAddressBookEntryPayload,
  SaveAddressBookEntryResult
> = {
  type: 'saveAddressBookEntry',
  idempotent: true,
  parse: zodParse(saveAddressBookEntrySchema),
  async execute(tx, ctx, payload) {
    await requireMember(tx, payload.shipperTenantId, ctx.actorId, ADDRESS_BOOK_ROLES);
    await requireTenantCapability(tx, payload.shipperTenantId, 'shipper');

    const input = inputFrom(payload);
    guard(input);

    const existing = await tx.query({
      collection: addressBookCollection(payload.shipperTenantId),
      filters: [{ field: 'status', op: '==', value: 'active' }],
    });
    const wanted = addressBookKey(input);
    const match = existing.find((row) => addressBookKey(row.data as unknown as AddressBookEntry) === wanted);
    if (match !== undefined) {
      const entryId = (match.data as unknown as AddressBookEntry).entryId;
      return { result: { entryId, created: false }, auditDetail: { entryId, reused: true } };
    }

    const entryId = ctx.newId('addr');
    const entry: AddressBookEntry = {
      ...input,
      entryId,
      tenantId: payload.shipperTenantId,
      status: 'active',
      createdAt: ctx.now,
      createdBy: ctx.actorId,
      updatedAt: ctx.now,
    };
    tx.write({ kind: 'create', path: addressBookEntryDoc(payload.shipperTenantId, entryId), data: { ...entry } });

    return { result: { entryId, created: true }, auditDetail: { entryId, label: entry.label } };
  },
};

const updateAddressBookEntrySchema = z.object({
  shipperTenantId: z.string().min(1),
  entryId: z.string().min(1),
  ...entryFields,
});

export type UpdateAddressBookEntryPayload = z.infer<typeof updateAddressBookEntrySchema>;

export interface UpdateAddressBookEntryResult extends DocData {
  entryId: string;
}

// Corrects an entry in place. Loads already posted copied their address values
// at post time, so this never rewrites history — it only changes what the
// create-load form offers next.
export const updateAddressBookEntryHandler: ActionHandler<
  UpdateAddressBookEntryPayload,
  UpdateAddressBookEntryResult
> = {
  type: 'updateAddressBookEntry',
  idempotent: true,
  parse: zodParse(updateAddressBookEntrySchema),
  async execute(tx, ctx, payload) {
    await requireMember(tx, payload.shipperTenantId, ctx.actorId, ADDRESS_BOOK_ROLES);

    const path = addressBookEntryDoc(payload.shipperTenantId, payload.entryId);
    const current = await tx.get(path);
    if (current === null) {
      throw new AppError('not-found', 'That saved address no longer exists.');
    }

    const input = inputFrom(payload);
    guard(input);

    tx.write({ kind: 'update', path, data: { ...input, updatedAt: ctx.now } });
    return { result: { entryId: payload.entryId }, auditDetail: { entryId: payload.entryId } };
  },
};

const archiveAddressBookEntrySchema = z.object({
  shipperTenantId: z.string().min(1),
  entryId: z.string().min(1),
});

export type ArchiveAddressBookEntryPayload = z.infer<typeof archiveAddressBookEntrySchema>;

export interface ArchiveAddressBookEntryResult extends DocData {
  entryId: string;
}

// Archived, never deleted — an entry a dispatcher no longer wants offered
// should stop appearing, not vanish from under a colleague mid-edit.
export const archiveAddressBookEntryHandler: ActionHandler<
  ArchiveAddressBookEntryPayload,
  ArchiveAddressBookEntryResult
> = {
  type: 'archiveAddressBookEntry',
  idempotent: true,
  parse: zodParse(archiveAddressBookEntrySchema),
  async execute(tx, ctx, payload) {
    await requireMember(tx, payload.shipperTenantId, ctx.actorId, ADDRESS_BOOK_ROLES);

    const path = addressBookEntryDoc(payload.shipperTenantId, payload.entryId);
    const current = await tx.get(path);
    if (current === null) {
      throw new AppError('not-found', 'That saved address no longer exists.');
    }
    if ((current as unknown as AddressBookEntry).status === 'archived') {
      return { result: { entryId: payload.entryId }, auditDetail: { entryId: payload.entryId, alreadyArchived: true } };
    }

    tx.write({ kind: 'update', path, data: { status: 'archived', updatedAt: ctx.now } });
    return { result: { entryId: payload.entryId }, auditDetail: { entryId: payload.entryId } };
  },
};
