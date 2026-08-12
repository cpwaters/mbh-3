// The invoice sent to a shipper once a job's proof of delivery is recorded.
// Pure data + pure helpers only — the actual email/PDF rendering is a vendor
// concern that lives behind the Mailer provider interface.

export interface InvoiceLineItem {
  description: string;
  amountGbpPence: number;
}

export interface InvoiceData {
  invoiceNumber: string;
  issuedAt: string; // ISO-8601 UTC
  dueAt: string; // ISO-8601 UTC
  jobId: string;
  carrierCompanyName: string;
  carrierVatNumber?: string;
  shipperCompanyName: string;
  recipientEmail: string;
  // Who signed for delivery, from the job's PoD evidence — absent when
  // there's none on file (e.g. the founder's synthetic test invoice).
  recipientName?: string;
  lineItems: InvoiceLineItem[];
  totalGbpPence: number;
}

// Deterministic and unique per job — re-processing the same outbox task (a
// crashed drain run reclaimed, or a retried send) always produces the same
// invoice number rather than minting a new one each time.
export function buildInvoiceNumber(jobId: string): string {
  return `INV-${jobId.toUpperCase()}`;
}

// Net 30 by default — a plain, standard payment term; the platform doesn't
// currently model per-shipper payment terms.
export const DEFAULT_INVOICE_NET_DAYS = 30;

export function invoiceDueDate(issuedAtIso: string, netDays: number = DEFAULT_INVOICE_NET_DAYS): string {
  const due = new Date(issuedAtIso);
  due.setUTCDate(due.getUTCDate() + netDays);
  return due.toISOString();
}
