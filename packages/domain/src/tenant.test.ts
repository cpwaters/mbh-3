import { describe, expect, it } from 'vitest';
import { isValidCapabilities, validateTenantSetup } from './tenant.js';

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
