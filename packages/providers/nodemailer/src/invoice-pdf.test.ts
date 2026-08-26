import { describe, expect, it } from 'vitest';
import { MYBACKHAUL_LOGO_PNG_BASE64, type InvoiceData } from '@mbh/domain';
import { invoicePdfBuffer } from './invoice-pdf.js';

const invoice: InvoiceData = {
  invoiceNumber: 'INV-JOB-E2E',
  issuedAt: '2026-08-04T00:00:00.000Z',
  dueAt: '2026-09-03T00:00:00.000Z',
  jobId: 'job-e2e',
  carrierCompanyName: 'Waters Haulage',
  shipperCompanyName: 'Acme Distribution',
  recipientEmail: 'billing@acme.test',
  lineItems: [{ description: 'Haulage services', amountGbpPence: 68000 }],
  totalGbpPence: 68000,
};

describe('invoicePdfBuffer', () => {
  it('renders a well-formed PDF buffer', async () => {
    const buffer = await invoicePdfBuffer(invoice);
    expect(buffer.subarray(0, 5).toString('ascii')).toBe('%PDF-');
    expect(buffer.length).toBeGreaterThan(500);
  });

  it('draws the letterhead when one is supplied', async () => {
    const plain = await invoicePdfBuffer(invoice);
    const withLogo = await invoicePdfBuffer(invoice, Buffer.from(MYBACKHAUL_LOGO_PNG_BASE64, 'base64'));
    expect(withLogo.subarray(0, 5).toString('ascii')).toBe('%PDF-');
    // The image data lands in the document, so it is measurably bigger.
    expect(withLogo.length).toBeGreaterThan(plain.length);
  });

  it('still renders when the logo bytes are unusable', async () => {
    // A corrupt image must not cost the carrier their invoice — the
    // letterhead is decoration, the billing is not.
    const buffer = await invoicePdfBuffer(invoice, Buffer.from('not an image'));
    expect(buffer.subarray(0, 5).toString('ascii')).toBe('%PDF-');
    expect(buffer.length).toBeGreaterThan(500);
  });
});
