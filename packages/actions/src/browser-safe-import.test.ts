import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

// apps/web imports this package (IDEMPOTENT_ACTION_TYPES, action payload
// types), and its barrel re-exports drain.ts — so every module reachable
// from index.ts is bundled into the BROWSER. Anything evaluated at module
// scope therefore also runs in a browser, where Node globals do not exist.
//
// Regression test for a real outage: sample-pod-images.ts decoded its PNGs
// with a top-level `Buffer.from(...)`, which threw "Buffer is not defined"
// on load and took the whole web app down (every e2e sign-in failed). Every
// Node-based unit test passed — Node has Buffer — so only the 7-minute
// browser e2e caught it. This owns that invariant cheaply.
//
// The rule is about WHEN, not whether: the drain runs server-side, so these
// globals are fine *inside* a function body (never called in a browser).
// They must not be touched while the module itself is being evaluated.
const NODE_ONLY_GLOBALS = new Set(['Buffer', 'process', '__dirname', '__filename', 'require']);

const SRC = join(import.meta.dirname, '.');

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    if (!entry.name.endsWith('.ts') || entry.name.endsWith('.test.ts')) return [];
    return [path];
  });
}

// Identifiers referenced by code that runs on import. Declarations whose
// bodies are deferred (functions, methods, classes) are deliberately not
// descended into — that code only runs when something calls it.
function moduleScopeGlobals(file: string): string[] {
  const source = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.ES2022, true);
  const found: string[] = [];

  const walkEager = (node: ts.Node): void => {
    if (
      ts.isFunctionDeclaration(node) ||
      ts.isFunctionExpression(node) ||
      ts.isArrowFunction(node) ||
      ts.isMethodDeclaration(node) ||
      ts.isConstructorDeclaration(node) ||
      ts.isGetAccessorDeclaration(node) ||
      ts.isSetAccessorDeclaration(node)
    ) {
      return; // deferred — its body does not run at import time
    }
    if (ts.isIdentifier(node) && NODE_ONLY_GLOBALS.has(node.text)) {
      found.push(node.text);
    }
    ts.forEachChild(node, walkEager);
  };

  for (const statement of source.statements) {
    // Type-only constructs are erased at build; they cannot execute.
    if (ts.isInterfaceDeclaration(statement) || ts.isTypeAliasDeclaration(statement)) continue;
    if (ts.isImportDeclaration(statement) || ts.isExportDeclaration(statement)) continue;
    if (ts.isFunctionDeclaration(statement) || ts.isClassDeclaration(statement)) continue;
    walkEager(statement);
  }

  return found;
}

describe('@mbh/actions is safe to import in a browser', () => {
  it('touches no Node-only global at module scope, in any module the barrel can reach', () => {
    const offenders = sourceFiles(SRC)
      .map((file) => ({ file: file.slice(SRC.length + 1), globals: moduleScopeGlobals(file) }))
      .filter((r) => r.globals.length > 0)
      .map((r) => `${r.file}: ${[...new Set(r.globals)].join(', ')}`);

    expect(offenders).toEqual([]);
  });

  it('detects a top-level Node global (the guard itself works)', () => {
    // Proves the walker isn't vacuously passing — this is the exact shape
    // that caused the outage, plus the safe shape it was replaced with.
    const probe = join(import.meta.dirname, '__probe__.ts');
    const check = (code: string): string[] => {
      const source = ts.createSourceFile(probe, code, ts.ScriptTarget.ES2022, true);
      const found: string[] = [];
      const walk = (n: ts.Node): void => {
        if (ts.isFunctionDeclaration(n) || ts.isArrowFunction(n) || ts.isFunctionExpression(n)) return;
        if (ts.isIdentifier(n) && NODE_ONLY_GLOBALS.has(n.text)) found.push(n.text);
        ts.forEachChild(n, walk);
      };
      for (const s of source.statements) {
        if (ts.isFunctionDeclaration(s)) continue;
        walk(s);
      }
      return found;
    };

    expect(check("export const X = Buffer.from('a', 'base64');")).toEqual(['Buffer']);
    expect(check("export function x() { return Buffer.from('a', 'base64'); }")).toEqual([]);
  });
});
