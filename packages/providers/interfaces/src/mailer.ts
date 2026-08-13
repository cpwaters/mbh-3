import type { InvoiceData } from '@mbh/domain';

// A resolved (already-downloaded) file to attach — the PoD photo(s) and
// signature, resolved from object storage before this interface is ever
// called. Mailer stays SMTP-and-rendering-only; it never talks to storage.
export interface MailAttachment {
  filename: string;
  content: Buffer;
  contentType: string;
  // Set to embed this attachment inline in the HTML body (referenced there
  // as `cid:${cid}`) instead of only listing it as a plain download — used
  // for the PoD signature/photos so they show directly in the invoice email.
  cid?: string;
}

// Send an invoice email to a shipper. One purpose-built method (not a generic
// "send any email" interface) — the invoice's HTML/PDF rendering is a vendor
// concern that lives inside the concrete adapter, mirroring Geocoder/
// RouteProvider's shape (a domain-typed input/output, not a raw HTTP client).
// `attachments` are additional files beyond the always-generated invoice PDF
// (PoD photos, the recipient's signature) — optional since not every send
// (e.g. the founder's synthetic test email) has any to offer.
export interface Mailer {
  sendInvoice(invoice: InvoiceData, attachments?: MailAttachment[]): Promise<void>;
}

export class MailerError extends Error {
  readonly recoverable: boolean;
  constructor(message: string, recoverable = true) {
    super(message);
    this.name = 'MailerError';
    this.recoverable = recoverable;
  }
}
