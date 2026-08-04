import type { InvoiceData } from '@mbh/domain';
import { type Mailer, MailerError } from '@mbh/provider-interfaces';

// Scriptable in-memory Mailer — the CI default. Records every invoice it was
// asked to send, so a test can assert on recipient/content without a real
// SMTP call. `failNext` forces one retryable error so the drain's backoff
// path is testable without a network.
export class InMemoryMailer implements Mailer {
  readonly sent: InvoiceData[] = [];
  private failNext = false;

  failOnce(): this {
    this.failNext = true;
    return this;
  }

  async sendInvoice(invoice: InvoiceData): Promise<void> {
    if (this.failNext) {
      this.failNext = false;
      throw new MailerError('scripted mailer failure');
    }
    this.sent.push(invoice);
  }
}
