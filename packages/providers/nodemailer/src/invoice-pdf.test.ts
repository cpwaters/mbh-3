import { describe, expect, it } from 'vitest';
import type { InvoiceData } from '@mbh/domain';
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
});
