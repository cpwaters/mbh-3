// Money is integer GBP pence, positive, finite, bounded. No floats anywhere
// near a price.

export const MAX_LOAD_PRICE_GBP_PENCE = 10_000_000; // £100,000

export function isValidLoadPriceGbpPence(pence: number): boolean {
  return Number.isInteger(pence) && pence > 0 && pence <= MAX_LOAD_PRICE_GBP_PENCE;
}

export function formatGbp(pence: number): string {
  return `£${(pence / 100).toLocaleString('en-GB', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}
