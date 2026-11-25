// Sharing a load beyond the app: a short link (/l/<code>) that opens a public
// page with the load's carrier-facing details, and the words and social links
// to post it with. The page shows only what any carrier already sees (the
// listing), never the shipper's addresses or contacts.

import { describeLoadVehicles, LOAD_VEHICLE_SIZE_LABELS, LOAD_VEHICLE_TYPE_LABELS, type Listing } from './listing.js';
import { formatGbp } from './money.js';

// One short link per load, however often it is shared.
export interface LoadShare {
  code: string;
  loadId: string;
  createdAt: string;
  createdBy: string; // the actor who first shared it
}

export const SHARE_CODE_LENGTH = 8;
const ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';

export function isShareCode(value: string): boolean {
  return new RegExp(`^[0-9A-Za-z]{${SHARE_CODE_LENGTH}}$`).test(value);
}

// An 8-character code drawn from a seed (a fresh random id): 62^8 codes, so a
// clash is rare and the action checks for one anyway. Deterministic for a
// given seed, which keeps it testable.
export function shareCodeFrom(seed: string): string {
  // Two independent 32-bit FNV-1a hashes give 64 bits to spend.
  let a = 0x811c9dc5;
  let b = 0x01000193 ^ 0x5bd1e995;
  for (let i = 0; i < seed.length; i += 1) {
    const c = seed.charCodeAt(i);
    a = Math.imul(a ^ c, 0x01000193) >>> 0;
    b = Math.imul(b ^ c, 0x01000193 + 2 * i + 1) >>> 0;
  }
  let code = '';
  let hi = a;
  let lo = b;
  for (let i = 0; i < SHARE_CODE_LENGTH; i += 1) {
    // Long division of the 64-bit (hi, lo) by 62, one digit at a time.
    const hiRem = hi % 62;
    hi = Math.floor(hi / 62);
    const mid = hiRem * 2 ** 32 + lo;
    code = ALPHABET[mid % 62] + code;
    lo = Math.floor(mid / 62) >>> 0;
  }
  return code;
}

export function sharePath(code: string): string {
  return `/l/${code}`;
}

// The parts of a load the words need: a listing has them, and so does the
// shipper's own view of its load.
export type ShareSummary = Pick<
  Listing,
  'origin' | 'destination' | 'pickupBy' | 'priceGbpPence' | 'vehicleSizes' | 'vehicleTypes' | 'adrRequired'
>;

// What goes with the link: the trade's shorthand for a backhaul.
// "Backhaul: Preston PR1 2AB → Blackpool FY1 1AA · collect 2026-08-06 · £550.00 · Artic · Refrigerated"
export function shareMessage(listing: ShareSummary): string {
  const parts = [
    `Backhaul: ${listing.origin.town} ${listing.origin.postcode} → ${listing.destination.town} ${listing.destination.postcode}`,
    `collect ${listing.pickupBy}`,
    formatGbp(listing.priceGbpPence),
  ];
  const size = describeLoadVehicles(listing.vehicleSizes, LOAD_VEHICLE_SIZE_LABELS);
  const type = describeLoadVehicles(listing.vehicleTypes, LOAD_VEHICLE_TYPE_LABELS);
  if (size !== null && size !== 'Any') parts.push(size);
  if (type !== null && type !== 'Any') parts.push(type);
  if (listing.adrRequired === true) parts.push('ADR');
  return parts.join(' · ');
}

export type SocialNetwork = 'facebook' | 'x' | 'reddit' | 'whatsapp' | 'linkedin' | 'email';

// Each network's own "share this" address. Instagram has none: it takes no
// links from the web, so it is reached through the phone's share sheet.
export function socialShareLinks(url: string, message: string): Record<SocialNetwork, string> {
  const u = encodeURIComponent(url);
  const m = encodeURIComponent(message);
  return {
    facebook: `https://www.facebook.com/sharer/sharer.php?u=${u}`,
    x: `https://twitter.com/intent/tweet?text=${m}&url=${u}`,
    reddit: `https://www.reddit.com/submit?url=${u}&title=${m}`,
    whatsapp: `https://wa.me/?text=${encodeURIComponent(`${message} ${url}`)}`,
    linkedin: `https://www.linkedin.com/sharing/share-offsite/?url=${u}`,
    email: `mailto:?subject=${m}&body=${encodeURIComponent(`${message}\n\n${url}`)}`,
  };
}
