import type { TenantCapability } from './entities.js';

// Creating a company: what a valid setup requires. A company does at least one
// of the two things the marketplace supports.

export const TENANT_CAPABILITIES: readonly TenantCapability[] = ['shipper', 'carrier'];

export const TENANT_CAPABILITY_LABELS: Readonly<Record<TenantCapability, string>> = {
  shipper: 'Post loads (shipper)',
  carrier: 'Carry loads (carrier)',
};

export function isValidTenantName(name: string): boolean {
  const n = name.trim();
  return n.length >= 2 && n.length <= 80;
}

export function isValidCapabilities(caps: readonly string[]): caps is TenantCapability[] {
  const known = caps.every((c) => (TENANT_CAPABILITIES as readonly string[]).includes(c));
  const unique = new Set(caps).size === caps.length;
  return caps.length >= 1 && known && unique;
}

export interface TenantSetupInput {
  name: string;
  capabilities: readonly string[];
}

export type TenantSetupCheck = { ok: true } | { ok: false; field: string; message: string };

export function validateTenantSetup(input: TenantSetupInput): TenantSetupCheck {
  if (!isValidTenantName(input.name)) {
    return { ok: false, field: 'name', message: 'Enter a company name.' };
  }
  if (!isValidCapabilities(input.capabilities)) {
    return { ok: false, field: 'capabilities', message: 'Choose at least one thing your company does.' };
  }
  return { ok: true };
}
