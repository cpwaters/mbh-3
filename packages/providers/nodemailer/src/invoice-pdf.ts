import PDFDocument from 'pdfkit';
import { formatGbp, type InvoiceData } from '@mbh/domain';

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
}

// Renders a one-page PDF invoice attachment, matching the email body's
// content. Runs server-side in the drain (Node), not the browser — a
// deliberate departure from architecture.md's client-side jsPDF precedent
// (that one's for the driver's evidence-pack export, a different feature);
// this PDF has no browser to render in, since it's built and attached inside
// a scheduled function.
export function invoicePdfBuffer(invoice: InvoiceData, letterhead?: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    // The letterhead: the carrier's own logo, or the MyBackHaul mark when
    // they have not set one. Drawn scaled into a fixed box so any shape of
    // logo lands in the same place, then the cursor is moved below it.
    // Wrapped because a corrupt image would otherwise throw here and fail
    // the whole invoice — the letterhead is decoration, not billing.
    if (letterhead !== undefined) {
      try {
        doc.image(letterhead, 50, 45, { fit: [140, 45] });
        doc.y = 45 + 45 + 12;
      } catch {
        doc.y = 50;
      }
    }

    doc
      .fontSize(20)
      .fillColor('#2563eb')
      .text('INVOICE', { continued: false })
      .fontSize(10)
      .fillColor('#6b7280')
      .text(invoice.invoiceNumber)
      .moveDown(0.3)
      .text(`Issued: ${fmtDate(invoice.issuedAt)}    Due: ${fmtDate(invoice.dueAt)}`)
      .moveDown(1.5);

    doc
      .fontSize(9)
      .fillColor('#6b7280')
      .text('FROM', { continued: false })
      .fontSize(12)
      .fillColor('#111827')
      .text(invoice.carrierCompanyName);
    if (invoice.carrierVatNumber) {
      doc.fontSize(10).fillColor('#6b7280').text(`VAT: ${invoice.carrierVatNumber}`);
    }
    doc
      .moveDown(0.8)
      .fontSize(9)
      .fillColor('#6b7280')
      .text('BILL TO')
      .fontSize(12)
      .fillColor('#111827')
      .text(invoice.shipperCompanyName)
      .moveDown(1.5);

    const tableTop = doc.y;
    doc
      .fontSize(9)
      .fillColor('#6b7280')
      .text('DESCRIPTION', 50, tableTop)
      .text('AMOUNT', 450, tableTop, { width: 95, align: 'right' });
    doc
      .moveTo(50, tableTop + 15)
      .lineTo(545, tableTop + 15)
      .strokeColor('#111827')
      .stroke();

    let y = tableTop + 24;
    doc.fontSize(11).fillColor('#111827');
    for (const item of invoice.lineItems) {
      doc.text(item.description, 50, y, { width: 380 });
      doc.text(formatGbp(item.amountGbpPence), 450, y, { width: 95, align: 'right' });
      y += 24;
    }

    doc
      .moveTo(50, y + 4)
      .lineTo(545, y + 4)
      .strokeColor('#e5e7eb')
      .stroke();

    doc
      .fontSize(10)
      .fillColor('#6b7280')
      .text('TOTAL DUE', 350, y + 16, { width: 100, align: 'right' })
      .fontSize(16)
      .fillColor('#2563eb')
      .text(formatGbp(invoice.totalGbpPence), 450, y + 12, { width: 95, align: 'right' });

    doc
      .fontSize(9)
      .fillColor('#9ca3af')
      .text(`Job reference ${invoice.jobId} — MyBackHaul`, 50, 760, { width: 495, align: 'center' });

    doc.end();
  });
}
