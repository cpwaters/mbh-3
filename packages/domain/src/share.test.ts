import { describe, expect, it } from 'vitest';
import type { Listing } from './listing.js';
import { isShareCode, shareCodeFrom, shareMessage, sharePath, socialShareLinks } from './share.js';

const listing: Listing = {
  loadId: 'load-1',
  shipperTenantId: 'shipper-1',
  origin: { town: 'Preston', postcode: 'PR1 2AB' },
  destination: { town: 'Blackpool', postcode: 'FY1 1AA' },
  description: 'Pallets',
  weightKg: 12000,
  palletCount: 10,
  priceGbpPence: 55000,
  pickupBy: '2026-08-06',
  deliverBy: '2026-08-07',
  postedAt: '2026-08-01T09:00:00.000Z',
};

describe('share codes', () => {
  it('are eight letters and digits, the same for the same seed and different for different ones', () => {
    const codes = Array.from({ length: 2000 }, (_, i) => shareCodeFrom(`share-${i}-${'x'.repeat(i % 7)}`));
    for (const code of codes) expect(isShareCode(code)).toBe(true);
    expect(new Set(codes).size).toBe(codes.length);
    expect(shareCodeFrom('share-1')).toBe(shareCodeFrom('share-1'));
    expect(sharePath('AbC12345')).toBe('/l/AbC12345');
  });

  it('refuses anything that is not a code', () => {
    expect(isShareCode('AbC1234')).toBe(false);
    expect(isShareCode('AbC12345/')).toBe(false);
    expect(isShareCode('../admin')).toBe(false);
  });
});

describe('the words that go with the link', () => {
  it('say the route, the collection day and the price, then the vehicle and ADR when asked for', () => {
    expect(shareMessage(listing)).toBe('Backhaul: Preston PR1 2AB → Blackpool FY1 1AA · collect 2026-08-06 · £550.00');
    expect(
      shareMessage({ ...listing, vehicleSizes: ['artic'], vehicleTypes: ['refrigerated'], adrRequired: true })
    ).toBe('Backhaul: Preston PR1 2AB → Blackpool FY1 1AA · collect 2026-08-06 · £550.00 · Artic · Refrigerated · ADR');
  });

  it('build each network’s share address with the link and words encoded', () => {
    const links = socialShareLinks('https://mybackhaul.test/l/AbC12345', 'Backhaul: A → B');
    expect(links.facebook).toBe('https://www.facebook.com/sharer/sharer.php?u=https%3A%2F%2Fmybackhaul.test%2Fl%2FAbC12345');
    expect(links.x).toContain('text=Backhaul%3A%20A%20%E2%86%92%20B');
    expect(links.reddit).toContain('url=https%3A%2F%2Fmybackhaul.test%2Fl%2FAbC12345');
    expect(links.whatsapp).toContain('https%3A%2F%2Fmybackhaul.test%2Fl%2FAbC12345');
  });
});
