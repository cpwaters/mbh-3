import type { TenantCapability } from '@mbh/domain';

// A carrier/shipper sign-up records which capability the new company should
// have, so onboarding (CreateCompany) can pre-select it once the account is
// made. sessionStorage survives the sign-up -> onboarding hop within the tab.
const KEY = 'mbh:signup-intent';

export function setSignupIntent(cap: TenantCapability): void {
  try {
    sessionStorage.setItem(KEY, cap);
  } catch {
    /* private mode / storage disabled — the chooser still works, just no pre-select */
  }
}

// Reads and clears the intent (one-shot) so it can't linger into a later company.
export function takeSignupIntent(): TenantCapability | null {
  try {
    const v = sessionStorage.getItem(KEY);
    if (v === 'carrier' || v === 'shipper') {
      sessionStorage.removeItem(KEY);
      return v;
    }
  } catch {
    /* ignore */
  }
  return null;
}
