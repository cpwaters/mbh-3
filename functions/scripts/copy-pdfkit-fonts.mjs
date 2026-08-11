#!/usr/bin/env node
// pdfkit's standard fonts (Helvetica, etc.) aren't embedded in its JS — it
// reads their AFM metrics from disk at runtime, relative to its own
// __dirname (see node_modules/pdfkit/js/pdfkit.js: `__dirname + '/data/
// Helvetica.afm'`). esbuild bundles pdfkit's CODE into dist/index.cjs, but
// can't bundle a file read at runtime, and firebase.json's functions
// `ignore` list excludes node_modules from the deploy entirely — so the
// deployed function has pdfkit's logic but none of its font data, and every
// invoice PDF render throws `ENOENT ... dist/data/Helvetica.afm` the moment
// it's actually exercised. Copying the data files to dist/data (the exact
// path the bundled __dirname resolves to once deployed) closes that gap.
import { createRequire } from 'node:module';
import { cpSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';

// pdfkit isn't resolvable from here directly — pnpm's strict, non-hoisted
// node_modules only exposes it inside @mbh/provider-nodemailer's own
// node_modules (the package that actually declares it as a dependency).
// Resolve @mbh/provider-nodemailer first (a workspace symlink, reachable
// from anywhere in the repo), then resolve pdfkit FROM there.
const require = createRequire(import.meta.url);
const nodemailerPkgDir = dirname(require.resolve('@mbh/provider-nodemailer/package.json'));
const nodemailerRequire = createRequire(join(nodemailerPkgDir, 'package.json'));
const pdfkitDataDir = join(dirname(nodemailerRequire.resolve('pdfkit')), 'data');
const destDir = join(process.cwd(), 'dist', 'data');

mkdirSync(destDir, { recursive: true });
cpSync(pdfkitDataDir, destDir, { recursive: true });
console.log(`copied pdfkit AFM font data -> ${destDir}`);
