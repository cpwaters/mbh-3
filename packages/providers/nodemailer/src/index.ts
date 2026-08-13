import nodemailer from 'nodemailer';
import type { InvoiceData } from '@mbh/domain';
import { type MailAttachment, type Mailer, MailerError } from '@mbh/provider-interfaces';
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
    attachments: {
      filename: string;
      content: Buffer;
      contentType: string;
      cid?: string;
      contentDisposition?: 'attachment' | 'inline';
    }[];
  }): Promise<unknown>;
}

export interface NodemailerMailerOptions {
  from: string;
  transport?: MailTransport;
  // SMTP connection details — only needed when `transport` isn't injected.
  host?: string;
  port?: number;
  // A getter, not a plain value: lets the caller defer resolving a secret
  // (e.g. Firebase's defineSecret().value(), which throws if the secret
  // isn't provisioned/bound) until a send is actually attempted, rather
  // than at construction time — see composition.ts.
  user?: () => string;
  pass?: () => string;
}

// The ONLY place SMTP is spoken. Builds the invoice's HTML body + PDF
// attachment and sends it via nodemailer. Third-party delivery only ever
// happens from the scheduled drain (never a user request) — see drain.ts.
export class NodemailerMailer implements Mailer {
  private readonly from: string;
  private readonly options: NodemailerMailerOptions;
  private transport: MailTransport | null;

  constructor(options: NodemailerMailerOptions) {
    this.from = options.from;
    this.options = options;
    this.transport = options.transport ?? null;
  }

  // Built lazily, on the first send — not the constructor — so a
  // not-yet-provisioned secret (or disabled Secret Manager API) only ever
  // fails an actual send attempt, which the drain already retries/settles
  // gracefully, rather than breaking every drain tick regardless of whether
  // there's an invoice to send.
  private getTransport(): MailTransport {
    if (this.transport !== null) return this.transport;
    const { host, port, user, pass } = this.options;
    this.transport = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: user !== undefined ? { user: user(), pass: pass?.() } : undefined,
    }) as unknown as MailTransport;
    return this.transport;
  }

  async sendInvoice(invoice: InvoiceData, attachments: MailAttachment[] = []): Promise<void> {
    let pdf: Buffer;
    try {
      pdf = await invoicePdfBuffer(invoice);
    } catch (cause) {
      // A rendering bug is not transient — retrying the same invoice data
      // will fail identically every time.
      throw new MailerError(`invoice PDF rendering failed: ${String(cause)}`, false);
    }

    try {
      const transport = this.getTransport();
      await transport.sendMail({
        from: this.from,
        to: invoice.recipientEmail,
        subject: `Invoice ${invoice.invoiceNumber} from ${invoice.carrierCompanyName}`,
        html: invoiceHtml(invoice, attachments),
        text: invoiceText(invoice),
        attachments: [
          {
            filename: `${invoice.invoiceNumber}.pdf`,
            content: pdf,
            contentType: 'application/pdf',
          },
          // A cid'd attachment is embedded inline in the HTML above (see
          // invoiceHtml's "Proof of delivery" section) — mark it 'inline' so
          // clients that respect contentDisposition don't also list it as a
          // separate download.
          ...attachments.map((a) => ({ ...a, ...(a.cid !== undefined ? { contentDisposition: 'inline' as const } : {}) })),
        ],
      });
    } catch (cause) {
      // SMTP failures (connection, auth, transient rejection) are worth
      // retrying — the drain's attempt cap bounds how long it keeps trying.
      throw new MailerError(`SMTP send failed: ${String(cause)}`);
    }
  }
}
