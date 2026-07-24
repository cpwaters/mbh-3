import { describe, expect, it } from 'vitest';
import { ESLint } from 'eslint';

// The canary: prove the project's eslint config actually flags the footgun —
// a React hook after a conditional early return — as an ERROR. A rule you
// believe is on but isn't is worse than no rule; this fails loudly if the
// wiring ever regresses. Lints inline snippets as if they were a web component
// so the apps/web react-hooks config applies.

const RULE = 'react-hooks/rules-of-hooks';
const asWebComponent = 'apps/web/src/components/Canary.tsx';

async function lint(code: string): Promise<string[]> {
  const eslint = new ESLint();
  const [result] = await eslint.lintText(code, { filePath: asWebComponent });
  return (result?.messages ?? []).map((m) => m.ruleId ?? '');
}

const BAD = `
import { useState } from 'react';
export function Canary({ ready }: { ready: boolean }) {
  if (!ready) return null;           // conditional early return...
  const [n] = useState(0);           // ...then a hook: the blank-screen footgun
  return <span>{n}</span>;
}
`;

const GOOD = `
import { useState } from 'react';
export function Canary({ ready }: { ready: boolean }) {
  const [n] = useState(0);           // all hooks first
  if (!ready) return null;
  return <span>{n}</span>;
}
`;

describe('lint canary: rules-of-hooks is wired and biting', () => {
  it('flags a hook after a conditional early return', async () => {
    expect(await lint(BAD)).toContain(RULE);
  });

  it('accepts the same component with hooks before the return', async () => {
    expect(await lint(GOOD)).not.toContain(RULE);
  });
});
