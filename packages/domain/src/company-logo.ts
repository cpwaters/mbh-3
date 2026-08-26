// A company's own logo: what counts as one, and where its bytes live.
//
// It belongs to the COMPANY, not to the member who happened to upload it. The
// invoice already takes the company name from the tenant record, and a logo
// hanging off one person's profile would mean the letterhead changed
// depending on which member you asked.

export const LOGO_CONTENT_TYPES: readonly string[] = ['image/png', 'image/jpeg'];

// PNG and JPEG only, deliberately. The logo is drawn into a PDF by pdfkit,
// which reads those two and nothing else, and is inlined into an email, where
// SVG is stripped by most clients. Accepting a format we cannot render would
// mean an upload that looks fine and then quietly vanishes off the invoice.
export const LOGO_CONTENT_TYPE_LABEL = 'PNG or JPEG';

// Generous for a logo, and far below the 10MB PoD photo ceiling: this is
// fetched and inlined into every invoice email the drain sends.
export const MAX_LOGO_BYTES = 2 * 1024 * 1024;

export interface CompanyLogoInput {
  contentType: string;
  sizeBytes: number;
}

export type CompanyLogoCheck = { ok: true } | { ok: false; message: string };

export function validateCompanyLogo(input: CompanyLogoInput): CompanyLogoCheck {
  if (!LOGO_CONTENT_TYPES.includes(input.contentType)) {
    return { ok: false, message: `Choose a ${LOGO_CONTENT_TYPE_LABEL} image.` };
  }
  if (input.sizeBytes <= 0) {
    return { ok: false, message: 'That file is empty.' };
  }
  if (input.sizeBytes > MAX_LOGO_BYTES) {
    return { ok: false, message: `That image is too large — keep it under ${MAX_LOGO_BYTES / (1024 * 1024)}MB.` };
  }
  return { ok: true };
}

// Where a company's logo lives in object storage. Keyed by requestId rather
// than a fixed name so a re-upload writes a new object instead of racing the
// drain, which may be reading the old one to send an invoice this minute.
// The tenantId leads, because the storage rule authorizes on it.
export const COMPANY_LOGO_PREFIX = 'company-logos';

export function companyLogoStoragePath(tenantId: string, requestId: string, contentType: string): string {
  const ext = contentType === 'image/png' ? 'png' : 'jpg';
  return `${COMPANY_LOGO_PREFIX}/${tenantId}/${requestId}.${ext}`;
}

// A stored ref must sit under this tenant's own folder — checked server-side
// so a caller cannot point their company's logo at somebody else's object.
export function isCompanyLogoRefFor(tenantId: string, ref: string): boolean {
  return ref.startsWith(`${COMPANY_LOGO_PREFIX}/${tenantId}/`) && !ref.includes('..');
}
