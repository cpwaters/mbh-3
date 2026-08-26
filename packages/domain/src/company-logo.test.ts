import { describe, it, expect } from 'vitest';
import {
  MAX_LOGO_BYTES,
  MYBACKHAUL_LOGO_PNG_BASE64,
  companyLogoStoragePath,
  isCompanyLogoRefFor,
  validateCompanyLogo,
} from './index.js';

describe('validateCompanyLogo', () => {
  it('accepts a PNG and a JPEG within the size cap', () => {
    expect(validateCompanyLogo({ contentType: 'image/png', sizeBytes: 1024 })).toEqual({ ok: true });
    expect(validateCompanyLogo({ contentType: 'image/jpeg', sizeBytes: MAX_LOGO_BYTES })).toEqual({ ok: true });
  });

  it('refuses a format the invoice cannot render', () => {
    // Not arbitrary strictness: pdfkit draws PNG and JPEG only, and email
    // clients strip SVG. Accepting these would mean an upload that looks
    // saved and then silently never appears on an invoice.
    for (const contentType of ['image/svg+xml', 'image/webp', 'image/gif', 'application/pdf']) {
      const check = validateCompanyLogo({ contentType, sizeBytes: 1024 });
      expect(check.ok, contentType).toBe(false);
    }
  });

  it('refuses an empty or oversized file', () => {
    expect(validateCompanyLogo({ contentType: 'image/png', sizeBytes: 0 }).ok).toBe(false);
    expect(validateCompanyLogo({ contentType: 'image/png', sizeBytes: MAX_LOGO_BYTES + 1 }).ok).toBe(false);
  });
});

describe('companyLogoStoragePath', () => {
  it('files the object under the tenant, with an extension matching the type', () => {
    expect(companyLogoStoragePath('t-1', 'req-9', 'image/png')).toBe('company-logos/t-1/req-9.png');
    expect(companyLogoStoragePath('t-1', 'req-9', 'image/jpeg')).toBe('company-logos/t-1/req-9.jpg');
  });

  it('gives a new object per request, so a re-upload never overwrites one mid-send', () => {
    const first = companyLogoStoragePath('t-1', 'req-1', 'image/png');
    const second = companyLogoStoragePath('t-1', 'req-2', 'image/png');
    expect(first).not.toBe(second);
  });
});

describe('isCompanyLogoRefFor', () => {
  it('accepts a ref under the tenant’s own folder', () => {
    expect(isCompanyLogoRefFor('t-1', 'company-logos/t-1/req-9.png')).toBe(true);
  });

  it('refuses another tenant’s object, a different prefix, or traversal', () => {
    expect(isCompanyLogoRefFor('t-1', 'company-logos/t-2/req-9.png')).toBe(false);
    expect(isCompanyLogoRefFor('t-1', 'pod/job-1/req-1/0.jpg')).toBe(false);
    expect(isCompanyLogoRefFor('t-1', 'company-logos/t-1/../t-2/req-9.png')).toBe(false);
  });
});

describe('the MyBackHaul fallback mark', () => {
  it('is a real PNG, so an invoice for a company with no logo still letterheads', () => {
    const bytes = Buffer.from(MYBACKHAUL_LOGO_PNG_BASE64, 'base64');
    expect(bytes.subarray(0, 8)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    // Small enough to inline into every invoice email without bloating it.
    expect(bytes.length).toBeLessThan(20 * 1024);
  });
});
