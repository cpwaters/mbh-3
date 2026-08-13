import { describe, expect, it } from 'vitest';
import type { InvoiceData } from '@mbh/domain';
import type { MailAttachment } from '@mbh/provider-interfaces';
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

  it('embeds the signature and photos inline via their cids when attachments carry one', () => {
    const attachments: MailAttachment[] = [
      { filename: `${invoice.invoiceNumber}.pdf`, content: Buffer.from('pdf'), contentType: 'application/pdf' },
      { filename: 'signature.png', content: Buffer.from('sig'), contentType: 'image/png', cid: 'signature' },
      { filename: 'delivery-photo-1.jpg', content: Buffer.from('p1'), contentType: 'image/jpeg', cid: 'photo-1' },
      { filename: 'delivery-photo-2.jpg', content: Buffer.from('p2'), contentType: 'image/jpeg', cid: 'photo-2' },
    ];
    const html = invoiceHtml({ ...invoice, recipientName: 'J. Smith' }, attachments);
    expect(html).toContain('Proof of delivery');
    expect(html).toContain('Signed for by J. Smith');
    expect(html).toContain('src="cid:signature"');
    expect(html).toContain('src="cid:photo-1"');
    expect(html).toContain('src="cid:photo-2"');
    // The PDF has no cid — never referenced as an inline image.
    expect(html).not.toContain(`cid:${invoice.invoiceNumber}`);
  });

  it('omits the Proof of delivery section entirely when no attachment carries a cid', () => {
    const html = invoiceHtml(invoice, [
      { filename: `${invoice.invoiceNumber}.pdf`, content: Buffer.from('pdf'), contentType: 'application/pdf' },
    ]);
    expect(html).not.toContain('Proof of delivery');
  });

  it('omits the Proof of delivery section when no attachments are given at all', () => {
    const html = invoiceHtml(invoice);
    expect(html).not.toContain('Proof of delivery');
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
