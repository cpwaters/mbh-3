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

  it('appends extra attachments (PoD photos, signature) after the invoice PDF', async () => {
    const { transport, sendMail } = stubTransport();
    const mailer = new NodemailerMailer({ from: 'billing@mybackhaul.app', transport });

    await mailer.sendInvoice(invoice, [
      { filename: 'signature.png', content: Buffer.from('sig'), contentType: 'image/png' },
      { filename: 'photo-1.jpg', content: Buffer.from('photo'), contentType: 'image/jpeg' },
    ]);

    const call = sendMail.mock.calls.at(0)?.[0];
    if (call === undefined) throw new Error('sendMail was not called with any arguments');
    expect(call.attachments).toHaveLength(3);
    expect(call.attachments[0].filename).toBe('INV-JOB-E2E.pdf'); // PDF always first
    expect(call.attachments[1].filename).toBe('signature.png');
    expect(call.attachments[2].filename).toBe('photo-1.jpg');
  });

  it('marks cid\'d attachments inline (embedded in the body, not a separate download) and passes the cid through', async () => {
    const { transport, sendMail } = stubTransport();
    const mailer = new NodemailerMailer({ from: 'billing@mybackhaul.app', transport });

    await mailer.sendInvoice(invoice, [
      { filename: 'signature.png', content: Buffer.from('sig'), contentType: 'image/png', cid: 'signature' },
    ]);

    const call = sendMail.mock.calls.at(0)?.[0];
    if (call === undefined) throw new Error('sendMail was not called with any arguments');
    expect(call.html).toContain('src="cid:signature"');
    const sigAttachment = call.attachments[1];
    expect(sigAttachment).toMatchObject({ filename: 'signature.png', cid: 'signature', contentDisposition: 'inline' });
    // The PDF has no cid — stays a plain download, not marked inline.
    expect(call.attachments[0].contentDisposition).toBeUndefined();
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

  it('a throwing credential getter (e.g. an unbound Firebase secret) fails the send cleanly, not the constructor', () => {
    // Regression test: NodemailerMailerOptions.user/pass are getters
    // specifically so a not-yet-provisioned secret's .value() throw is
    // deferred to send time. Constructing the mailer must never throw —
    // getDrainDeps() builds one every drain tick regardless of whether
    // there's an invoice to send.
    expect(
      () =>
        new NodemailerMailer({
          from: 'billing@mybackhaul.app',
          host: 'smtp.example.test',
          port: 587,
          user: () => {
            throw new Error('Secret SMTP_USER is not available — bind it to the function first');
          },
          pass: () => 'unused',
        })
    ).not.toThrow();
  });

  it('and that same throwing getter rejects sendInvoice as a MailerError instead of crashing', async () => {
    const mailer = new NodemailerMailer({
      from: 'billing@mybackhaul.app',
      host: 'smtp.example.test',
      port: 587,
      user: () => {
        throw new Error('Secret SMTP_USER is not available — bind it to the function first');
      },
      pass: () => 'unused',
    });

    await expect(mailer.sendInvoice(invoice)).rejects.toMatchObject({ name: 'MailerError' });
  });
});
