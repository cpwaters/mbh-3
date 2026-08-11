import { describe, expect, it } from 'vitest';
import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

// Regression test for a deploy-only failure that unit tests can't see: pdfkit
// reads its standard font metrics (Helvetica.afm etc.) from disk at runtime,
// relative to its own __dirname — but esbuild only bundles CODE into
// dist/index.cjs, and firebase.json's functions `ignore` list excludes
// node_modules from the deploy entirely. So every invoice PDF render worked
// in dev (where node_modules/pdfkit/js/data is always reachable) and threw
// `ENOENT ... dist/data/Helvetica.afm` the moment it ran as the deployed
// function — exactly the failure a founder's "send test email" reported in
// production. scripts/copy-pdfkit-fonts.mjs (wired into the build script)
// copies the font data to the exact path the bundled __dirname resolves to;
// this proves that copy actually happened, using ONLY the build's real
// output — no test-time knowledge of where pdfkit "should" be.
//
// Filesystem-only — needs no emulator, but lives alongside the other
// functions integration tests since `test:functions` already builds
// functions before running (so dist/ is guaranteed to exist and current).

const functionsDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

describe('functions build — pdfkit font data', () => {
  it('copies every pdfkit standard-font AFM file to dist/data (the exact path pdfkit\'s __dirname-relative read expects once deployed)', () => {
    const distDataDir = path.join(functionsDir, 'dist', 'data');
    const files = readdirSync(distDataDir);
    const afmFiles = files.filter((f) => f.endsWith('.afm'));

    // The 14 standard PDF fonts pdfkit ships metrics for (Helvetica, Times,
    // Courier x their bold/oblique variants, Symbol, ZapfDingbats).
    expect(afmFiles).toEqual(
      expect.arrayContaining([
        'Helvetica.afm',
        'Helvetica-Bold.afm',
        'Helvetica-Oblique.afm',
        'Helvetica-BoldOblique.afm',
        'Times-Roman.afm',
        'Times-Bold.afm',
        'Times-Italic.afm',
        'Times-BoldItalic.afm',
        'Courier.afm',
        'Courier-Bold.afm',
        'Courier-Oblique.afm',
        'Courier-BoldOblique.afm',
        'Symbol.afm',
        'ZapfDingbats.afm',
      ])
    );
  });
});
