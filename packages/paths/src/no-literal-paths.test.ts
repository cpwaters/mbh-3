import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { COLLECTIONS } from './index.js';

// Pins the invariant: collection-scoped path literals ('loads/…', 'jobs/…',
// etc.) exist ONLY in this paths package. Everywhere else must call a path
// builder, so the storage layout has exactly one definition.

const here = dirname(fileURLToPath(import.meta.url));
const packagesRoot = join(here, '..', '..'); // packages/

// Pure layers that must never hand-build a path. (apps/functions compose at
// the boundary and are audited separately once they exist.)
const SCANNED_PACKAGES = ['domain', 'actions', 'auth', 'offline'];

function collectTsFiles(dir: string): string[] {
  const out: string[] = [];
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const entry of entries) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...collectTsFiles(full));
    } else if (
      entry.endsWith('.ts') &&
      !entry.endsWith('.test.ts') &&
      entry !== 'test-harness.ts'
    ) {
      out.push(full);
    }
  }
  return out;
}

describe('no literal collection paths outside @mbh/paths', () => {
  it('finds none in the pure layers', () => {
    // Build the forbidden pattern from the collection names dynamically so
    // this test's own source contains no offending literal.
    const names = Object.values(COLLECTIONS).map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    const pattern = new RegExp(`['"\`](?:${names.join('|')})/`);

    const offenders: string[] = [];
    for (const pkg of SCANNED_PACKAGES) {
      const files = collectTsFiles(join(packagesRoot, pkg, 'src'));
      for (const file of files) {
        const text = readFileSync(file, 'utf8');
        text.split('\n').forEach((line, i) => {
          if (pattern.test(line)) offenders.push(`${file}:${i + 1}: ${line.trim()}`);
        });
      }
    }

    expect(offenders).toEqual([]);
  });
});
