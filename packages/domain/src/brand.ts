// The MyBackHaul mark, 160x160 PNG, as base64.
//
// Why a string constant and not a file: this is read server-side, inside the
// scheduled drain, to letterhead an invoice for a company that has not set a
// logo of its own. A file next to the source would have to survive bundling
// into the functions deploy — exactly what caught us out once already, when
// pdfkit's font data never reached production and every invoice PDF failed.
// A constant compiles into the bundle and cannot go missing.
//
// Regenerate from apps/web/public/android-chrome-384x384.png if the mark
// changes; keep it small, since it is inlined into every invoice email.
const BASE64 = [
  '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',
  'RK5CYII=',
].join('');

export const MYBACKHAUL_LOGO_PNG_BASE64 = BASE64;
export const MYBACKHAUL_LOGO_CONTENT_TYPE = 'image/png';
