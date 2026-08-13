import { formatGbp, type InvoiceData } from '@mbh/domain';
import type { MailAttachment } from '@mbh/provider-interfaces';

// Renders the invoice email body. A plain, self-contained HTML table styled
// like a paper invoice — no external assets or stylesheets (email clients
// strip most CSS anyway), so everything is inline.
function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
}

// The PoD signature/photos, embedded directly in the body via the `cid`s
// buildAttachments() (packages/actions/src/drain.ts) assigns — 'signature'
// and 'photo-N' are the contract between the two. Attachments without a
// `cid` (the invoice PDF) are ignored here; they stay plain downloads.
function proofOfDeliverySection(invoice: InvoiceData, attachments: MailAttachment[]): string {
  const signatureCid = attachments.find((a) => a.cid === 'signature')?.cid;
  const photoCids = attachments.filter((a) => a.cid?.startsWith('photo-')).map((a) => a.cid as string);
  if (signatureCid === undefined && photoCids.length === 0) return '';

  const signatureImg =
    signatureCid !== undefined
      ? `<img src="cid:${signatureCid}" alt="Recipient signature" style="max-width:220px;border:1px solid #e5e7eb;border-radius:4px;padding:8px;background:#fff;display:block;margin-bottom:16px;" />`
      : '';
  const photoImgs = photoCids
    .map(
      (cid) =>
        `<img src="cid:${cid}" alt="Delivery photo" style="max-width:260px;max-height:260px;object-fit:cover;border:1px solid #e5e7eb;border-radius:4px;margin:0 8px 8px 0;" />`
    )
    .join('');

  return `
  <div style="margin-top:24px;padding-top:16px;border-top:1px solid #e5e7eb;">
    <div style="font-size:11px;text-transform:uppercase;color:#6b7280;margin-bottom:8px;">Proof of delivery</div>
    ${invoice.recipientName ? `<div style="font-size:13px;color:#111827;margin-bottom:8px;">Signed for by ${escapeHtml(invoice.recipientName)}</div>` : ''}
    ${signatureImg}
    ${photoImgs ? `<div>${photoImgs}</div>` : ''}
  </div>`;
}

export function invoiceHtml(invoice: InvoiceData, attachments: MailAttachment[] = []): string {
  const rows = invoice.lineItems
    .map(
      (item) => `
        <tr>
          <td style="padding:10px 0;border-bottom:1px solid #e5e7eb;color:#111827;">${escapeHtml(item.description)}</td>
          <td style="padding:10px 0;border-bottom:1px solid #e5e7eb;color:#111827;text-align:right;">${formatGbp(item.amountGbpPence)}</td>
        </tr>`
    )
    .join('');

  return `
<div style="font-family:Arial,Helvetica,sans-serif;max-width:600px;margin:0 auto;color:#111827;">
  <div style="border-bottom:3px solid #2563eb;padding-bottom:16px;margin-bottom:24px;display:flex;justify-content:space-between;align-items:flex-start;">
    <div>
      <div style="font-size:22px;font-weight:bold;color:#2563eb;">INVOICE</div>
      <div style="color:#6b7280;font-size:13px;">${escapeHtml(invoice.invoiceNumber)}</div>
    </div>
    <div style="text-align:right;font-size:13px;color:#6b7280;">
      <div>Issued: ${fmtDate(invoice.issuedAt)}</div>
      <div>Due: ${fmtDate(invoice.dueAt)}</div>
    </div>
  </div>

  <table style="width:100%;margin-bottom:24px;">
    <tr>
      <td style="vertical-align:top;">
        <div style="font-size:11px;text-transform:uppercase;color:#6b7280;margin-bottom:4px;">From</div>
        <div style="font-weight:bold;">${escapeHtml(invoice.carrierCompanyName)}</div>
        ${invoice.carrierVatNumber ? `<div style="color:#6b7280;font-size:13px;">VAT: ${escapeHtml(invoice.carrierVatNumber)}</div>` : ''}
      </td>
      <td style="vertical-align:top;text-align:right;">
        <div style="font-size:11px;text-transform:uppercase;color:#6b7280;margin-bottom:4px;">Bill To</div>
        <div style="font-weight:bold;">${escapeHtml(invoice.shipperCompanyName)}</div>
      </td>
    </tr>
  </table>

  <table style="width:100%;border-collapse:collapse;margin-bottom:16px;">
    <thead>
      <tr>
        <th style="text-align:left;padding-bottom:8px;border-bottom:2px solid #111827;font-size:12px;text-transform:uppercase;color:#6b7280;">Description</th>
        <th style="text-align:right;padding-bottom:8px;border-bottom:2px solid #111827;font-size:12px;text-transform:uppercase;color:#6b7280;">Amount</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>

  <table style="width:100%;">
    <tr>
      <td></td>
      <td style="text-align:right;padding-top:8px;">
        <div style="font-size:13px;color:#6b7280;">Total due</div>
        <div style="font-size:24px;font-weight:bold;color:#2563eb;">${formatGbp(invoice.totalGbpPence)}</div>
      </td>
    </tr>
  </table>
  ${proofOfDeliverySection(invoice, attachments)}
  <div style="margin-top:32px;padding-top:16px;border-top:1px solid #e5e7eb;color:#9ca3af;font-size:12px;">
    Job reference ${escapeHtml(invoice.jobId)} — MyBackHaul
  </div>
</div>`;
}

export function invoiceText(invoice: InvoiceData): string {
  const lines = invoice.lineItems.map((item) => `${item.description}: ${formatGbp(item.amountGbpPence)}`);
  return [
    `INVOICE ${invoice.invoiceNumber}`,
    `Issued: ${fmtDate(invoice.issuedAt)}  Due: ${fmtDate(invoice.dueAt)}`,
    '',
    `From: ${invoice.carrierCompanyName}${invoice.carrierVatNumber ? ` (VAT ${invoice.carrierVatNumber})` : ''}`,
    `Bill To: ${invoice.shipperCompanyName}`,
    '',
    ...lines,
    '',
    `Total due: ${formatGbp(invoice.totalGbpPence)}`,
    '',
    `Job reference ${invoice.jobId} — MyBackHaul`,
  ].join('\n');
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
