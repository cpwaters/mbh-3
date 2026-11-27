// Stripe's REST API, with no SDK: form-encoded POSTs and JSON back. Kept apart
// from provision.ts so the deployed function never loads the script.

export type StripeFetch = (
  path: string,
  init: { method: 'GET' | 'POST'; form?: Record<string, string> }
) => Promise<Record<string, unknown>>;

// Stripe's form encoding flattens nested params as a[b][0]=c — this takes the
// already-flattened keys, so call sites read like Stripe's own docs.
export function encodeForm(form: Record<string, string>): string {
  return Object.entries(form)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&');
}

export function stripeFetch(secretKey: string, base = 'https://api.stripe.com'): StripeFetch {
  return async (path, init) => {
    const res = await fetch(`${base}${path}`, {
      method: init.method,
      headers: {
        authorization: `Bearer ${secretKey}`,
        ...(init.form !== undefined ? { 'content-type': 'application/x-www-form-urlencoded' } : {}),
      },
      ...(init.form !== undefined ? { body: encodeForm(init.form) } : {}),
    });
    const body = (await res.json()) as Record<string, unknown>;
    if (!res.ok) {
      const err = body.error as { message?: string } | undefined;
      throw Object.assign(
        new Error(`Stripe ${init.method} ${path} failed (${res.status}): ${err?.message ?? 'unknown error'}`),
        { status: res.status }
      );
    }
    return body;
  };
}
