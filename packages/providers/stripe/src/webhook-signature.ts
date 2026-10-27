import { createHmac, timingSafeEqual } from 'node:crypto';

// Stripe's webhook signature scheme, implemented directly rather than through
// the SDK — it is one HMAC, and this way the dispatch function carries no
// Stripe dependency at all:
//
//   Stripe-Signature: t=<unix seconds>,v1=<hex hmac>[,v1=<hex hmac>…]
//   hmac = HMAC-SHA256(key = signing secret, msg = `${t}.${raw body}`)
//
// Several v1 values appear while a secret is being rolled; any one matching is
// enough. The timestamp is checked against a tolerance so a captured request
// cannot be replayed later (Stripe's own default is five minutes).
export const DEFAULT_TOLERANCE_SECONDS = 300;

export function signStripePayload(secret: string, timestamp: number, rawBody: string): string {
  return createHmac('sha256', secret).update(`${timestamp}.${rawBody}`, 'utf8').digest('hex');
}

function parseHeader(header: string): { timestamp: number; signatures: string[] } | null {
  let timestamp: number | null = null;
  const signatures: string[] = [];
  for (const part of header.split(',')) {
    const eq = part.indexOf('=');
    if (eq <= 0) continue;
    const key = part.slice(0, eq).trim();
    const value = part.slice(eq + 1).trim();
    if (key === 't' && /^\d+$/.test(value)) timestamp = Number(value);
    if (key === 'v1' && /^[0-9a-f]{64}$/.test(value)) signatures.push(value);
  }
  return timestamp === null || signatures.length === 0 ? null : { timestamp, signatures };
}

export type SignatureCheck = { ok: true; body: unknown } | { ok: false };

// The parsed body when the signature is genuine and recent; { ok: false }
// when it is missing, forged, stale, or the body is not JSON.
export function verifyStripeSignature(
  secret: string,
  rawBody: string,
  signatureHeader: string | undefined,
  nowSeconds: number,
  toleranceSeconds: number = DEFAULT_TOLERANCE_SECONDS
): SignatureCheck {
  if (signatureHeader === undefined) return { ok: false };
  const parsed = parseHeader(signatureHeader);
  if (parsed === null) return { ok: false };
  if (Math.abs(nowSeconds - parsed.timestamp) > toleranceSeconds) return { ok: false };

  const expected = Buffer.from(signStripePayload(secret, parsed.timestamp, rawBody), 'hex');
  const genuine = parsed.signatures.some((sig) => {
    const given = Buffer.from(sig, 'hex');
    return given.length === expected.length && timingSafeEqual(given, expected);
  });
  if (!genuine) return { ok: false };

  try {
    return { ok: true, body: JSON.parse(rawBody) as unknown };
  } catch {
    return { ok: false };
  }
}
