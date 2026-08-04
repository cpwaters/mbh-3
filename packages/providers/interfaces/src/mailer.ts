import type { InvoiceData } from '@mbh/domain';

// Send an invoice email to a shipper. One purpose-built method (not a generic
// "send any email" interface) — the invoice's HTML/PDF rendering is a vendor
// concern that lives inside the concrete adapter, mirroring Geocoder/
// RouteProvider's shape (a domain-typed input/output, not a raw HTTP client).
export interface Mailer {
  sendInvoice(invoice: InvoiceData): Promise<void>;
}

export class MailerError extends Error {
  readonly recoverable: boolean;
  constructor(message: string, recoverable = true) {
    super(message);
    this.name = 'MailerError';
    this.recoverable = recoverable;
  }
}
