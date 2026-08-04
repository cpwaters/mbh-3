import nodemailer from 'nodemailer';
import type { InvoiceData } from '@mbh/domain';
import { type Mailer, MailerError } from '@mbh/provider-interfaces';
import { invoiceHtml, invoiceText } from './invoice-html.js';
import { invoicePdfBuffer } from './invoice-pdf.js';

export { invoiceHtml, invoiceText } from './invoice-html.js';
export { invoicePdfBuffer } from './invoice-pdf.js';

// A minimal structural view of the nodemailer transporter we consume, so this
// adapter can be unit-tested with a stub instead of a real SMTP connection —
// same shape as PostcodesIoGeocoder's injectable FetchLike.
export interface MailTransport {
  sendMail(options: {
    from: string;
    to: string;
    subject: string;
    html: string;
    text: string;
    attachments: { filename: string; content: Buffer; contentType: string }[];
  }): Promise<unknown>;
}

export interface NodemailerMailerOptions {
  from: string;
  transport?: MailTransport;
  // SMTP connection details — only needed when `transport` isn't injected.
  host?: string;
  port?: number;
  user?: string;
  pass?: string;
}

// The ONLY place SMTP is spoken. Builds the invoice's HTML body + PDF
// attachment and sends it via nodemailer. Third-party delivery only ever
// happens from the scheduled drain (never a user request) — see drain.ts.
export class NodemailerMailer implements Mailer {
  private readonly from: string;
  private readonly transport: MailTransport;

  constructor(options: NodemailerMailerOptions) {
    this.from = options.from;
    this.transport =
      options.transport ??
      (nodemailer.createTransport({
        host: options.host,
        port: options.port,
        secure: options.port === 465,
        auth: options.user !== undefined ? { user: options.user, pass: options.pass } : undefined,
      }) as unknown as MailTransport);
  }

  async sendInvoice(invoice: InvoiceData): Promise<void> {
    let pdf: Buffer;
    try {
      pdf = await invoicePdfBuffer(invoice);
    } catch (cause) {
      // A rendering bug is not transient — retrying the same invoice data
      // will fail identically every time.
      throw new MailerError(`invoice PDF rendering failed: ${String(cause)}`, false);
    }

    try {
      await this.transport.sendMail({
        from: this.from,
        to: invoice.recipientEmail,
        subject: `Invoice ${invoice.invoiceNumber} from ${invoice.carrierCompanyName}`,
        html: invoiceHtml(invoice),
        text: invoiceText(invoice),
        attachments: [
          {
            filename: `${invoice.invoiceNumber}.pdf`,
            content: pdf,
            contentType: 'application/pdf',
          },
        ],
      });
    } catch (cause) {
      // SMTP failures (connection, auth, transient rejection) are worth
      // retrying — the drain's attempt cap bounds how long it keeps trying.
      throw new MailerError(`SMTP send failed: ${String(cause)}`);
    }
  }
}
