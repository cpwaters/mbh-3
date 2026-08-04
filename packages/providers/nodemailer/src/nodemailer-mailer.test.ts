import { describe, expect, it, vi } from 'vitest';
import type { InvoiceData } from '@mbh/domain';
import { MailerError } from '@mbh/provider-interfaces';
import { NodemailerMailer, type MailTransport } from './index.js';

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

function stubTransport(): { transport: MailTransport; sendMail: ReturnType<typeof vi.fn> } {
  const sendMail = vi.fn().mockResolvedValue({ messageId: 'stub' });
  return { transport: { sendMail }, sendMail };
}

describe('NodemailerMailer', () => {
  it('sends the invoice as HTML + a PDF attachment to the recipient', async () => {
    const { transport, sendMail } = stubTransport();
    const mailer = new NodemailerMailer({ from: 'billing@mybackhaul.app', transport });

    await mailer.sendInvoice(invoice);

    expect(sendMail).toHaveBeenCalledTimes(1);
    const call = sendMail.mock.calls.at(0)?.[0];
    if (call === undefined) throw new Error('sendMail was not called with any arguments');
    expect(call.to).toBe('billing@acme.test');
    expect(call.from).toBe('billing@mybackhaul.app');
    expect(call.subject).toContain('INV-JOB-E2E');
    expect(call.html).toContain('Waters Haulage');
    expect(call.attachments).toHaveLength(1);
    expect(call.attachments[0].filename).toBe('INV-JOB-E2E.pdf');
    expect(Buffer.isBuffer(call.attachments[0].content)).toBe(true);
  });

  it('wraps an SMTP failure as a recoverable MailerError', async () => {
    const transport: MailTransport = { sendMail: vi.fn().mockRejectedValue(new Error('connection refused')) };
    const mailer = new NodemailerMailer({ from: 'billing@mybackhaul.app', transport });

    await expect(mailer.sendInvoice(invoice)).rejects.toMatchObject({
      name: 'MailerError',
      recoverable: true,
    });
  });

  it('MailerError defaults to recoverable', () => {
    expect(new MailerError('x').recoverable).toBe(true);
    expect(new MailerError('x', false).recoverable).toBe(false);
  });
});
