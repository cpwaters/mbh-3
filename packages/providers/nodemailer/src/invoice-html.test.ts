import { describe, expect, it } from 'vitest';
import type { InvoiceData } from '@mbh/domain';
import { invoiceHtml, invoiceText } from './invoice-html.js';

const invoice: InvoiceData = {
  invoiceNumber: 'INV-JOB-E2E',
  issuedAt: '2026-08-04T00:00:00.000Z',
  dueAt: '2026-09-03T00:00:00.000Z',
  jobId: 'job-e2e',
  carrierCompanyName: 'Waters Haulage',
  carrierVatNumber: 'GB123456789',
  shipperCompanyName: 'Acme Distribution',
  recipientEmail: 'billing@acme.test',
  lineItems: [{ description: 'Haulage: Trafford, M17 1WS → Leith, EH6 6JJ (Job job-e2e)', amountGbpPence: 68000 }],
  totalGbpPence: 68000,
};

describe('invoiceHtml', () => {
  it('includes the invoice number, both company names, the total, and the VAT number', () => {
    const html = invoiceHtml(invoice);
    expect(html).toContain('INV-JOB-E2E');
    expect(html).toContain('Waters Haulage');
    expect(html).toContain('Acme Distribution');
    expect(html).toContain('£680.00');
    expect(html).toContain('GB123456789');
  });

  it('omits the VAT line when the carrier has none', () => {
    const withoutVat: InvoiceData = {
      invoiceNumber: invoice.invoiceNumber,
      issuedAt: invoice.issuedAt,
      dueAt: invoice.dueAt,
      jobId: invoice.jobId,
      carrierCompanyName: invoice.carrierCompanyName,
      shipperCompanyName: invoice.shipperCompanyName,
      recipientEmail: invoice.recipientEmail,
      lineItems: invoice.lineItems,
      totalGbpPence: invoice.totalGbpPence,
    };
    const html = invoiceHtml(withoutVat);
    expect(html).not.toContain('VAT:');
  });

  it('escapes company names to avoid HTML injection', () => {
    const html = invoiceHtml({ ...invoice, shipperCompanyName: '<script>alert(1)</script>' });
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });
});

describe('invoiceText', () => {
  it('is a readable plain-text fallback with the same key facts', () => {
    const text = invoiceText(invoice);
    expect(text).toContain('INV-JOB-E2E');
    expect(text).toContain('Waters Haulage');
    expect(text).toContain('£680.00');
  });
});
