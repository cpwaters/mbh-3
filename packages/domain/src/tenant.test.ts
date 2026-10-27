import { describe, expect, it } from 'vitest';
import { isTenantSuspended, isValidCapabilities, isValidSuspensionReason, validateTenantSetup } from './tenant.js';

describe('tenant setup', () => {
  it('accepts a named company with at least one capability', () => {
    expect(validateTenantSetup({ name: 'Waters Haulage', capabilities: ['carrier'] })).toEqual({ ok: true });
    expect(validateTenantSetup({ name: 'Acme', capabilities: ['shipper', 'carrier'] })).toEqual({ ok: true });
  });

  it('rejects unknown, duplicate, or empty capabilities', () => {
    expect(isValidCapabilities([])).toBe(false);
    expect(isValidCapabilities(['carrier', 'carrier'])).toBe(false);
    expect(isValidCapabilities(['broker'])).toBe(false);
    expect(isValidCapabilities(['shipper', 'carrier'])).toBe(true);
  });

  it('rejects a too-short name and empty capabilities with the offending field', () => {
    expect(validateTenantSetup({ name: 'a', capabilities: ['carrier'] })).toMatchObject({
      ok: false,
      field: 'name',
    });
    expect(validateTenantSetup({ name: 'Acme', capabilities: [] })).toMatchObject({
      ok: false,
      field: 'capabilities',
    });
  });
});

describe('tenant suspension', () => {
  it('treats a company with no status as active, since most predate the field', () => {
    expect(isTenantSuspended({})).toBe(false);
    expect(isTenantSuspended({ status: 'active' })).toBe(false);
    expect(isTenantSuspended({ status: 'suspended' })).toBe(true);
  });

  it('wants a reason a member could actually read', () => {
    expect(isValidSuspensionReason('  ')).toBe(false);
    expect(isValidSuspensionReason('Unpaid invoices')).toBe(true);
    expect(isValidSuspensionReason('x'.repeat(301))).toBe(false);
  });
});
