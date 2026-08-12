import type { InvoiceData } from '@mbh/domain';
import { type MailAttachment, type Mailer, MailerError } from '@mbh/provider-interfaces';

// Scriptable in-memory Mailer — the CI default. Records every invoice it was
// asked to send, so a test can assert on recipient/content without a real
// SMTP call. `failNext` forces one retryable error so the drain's backoff
// path is testable without a network.
export class InMemoryMailer implements Mailer {
  readonly sent: InvoiceData[] = [];
  // Index-aligned with `sent` — the attachments passed alongside each send.
  readonly sentAttachments: MailAttachment[][] = [];
  private failNext = false;

  failOnce(): this {
    this.failNext = true;
    return this;
  }

  async sendInvoice(invoice: InvoiceData, attachments: MailAttachment[] = []): Promise<void> {
    if (this.failNext) {
      this.failNext = false;
      throw new MailerError('scripted mailer failure');
    }
    this.sent.push(invoice);
    this.sentAttachments.push(attachments);
  }
}
