import { describe, expect, it } from 'vitest';
import {
  ACTIVE_JOB_STATUSES,
  canTransitionJob,
  canTransitionLoad,
  isActiveJobStatus,
  JOB_TRANSITIONS,
  LOAD_TRANSITIONS,
} from './transitions.js';
import { isValidLoadPriceGbpPence, MAX_LOAD_PRICE_GBP_PENCE, formatGbp } from './money.js';
import type { JobStatus, LoadStatus } from './entities.js';

describe('load transitions', () => {
  it('allows available -> matched and available -> cancelled', () => {
    expect(canTransitionLoad('available', 'matched')).toBe(true);
    expect(canTransitionLoad('available', 'cancelled')).toBe(true);
  });

  it('allows matched -> fulfilled and the matched -> available correction path', () => {
    expect(canTransitionLoad('matched', 'fulfilled')).toBe(true);
    expect(canTransitionLoad('matched', 'available')).toBe(true);
  });

  it('treats cancelled and fulfilled as terminal', () => {
    const statuses = Object.keys(LOAD_TRANSITIONS) as LoadStatus[];
    for (const to of statuses) {
      expect(canTransitionLoad('cancelled', to)).toBe(false);
      expect(canTransitionLoad('fulfilled', to)).toBe(false);
    }
  });

  it('refuses skipping states', () => {
    expect(canTransitionLoad('available', 'fulfilled')).toBe(false);
  });
});

describe('job transitions', () => {
  it('walks the happy path strictly in order', () => {
    expect(canTransitionJob('accepted', 'collected')).toBe(true);
    expect(canTransitionJob('collected', 'in_transit')).toBe(true);
    expect(canTransitionJob('in_transit', 'delivered')).toBe(true);
    expect(canTransitionJob('delivered', 'closed')).toBe(true);
  });

  it('refuses skipping states and going backwards', () => {
    expect(canTransitionJob('accepted', 'delivered')).toBe(false);
    expect(canTransitionJob('delivered', 'in_transit')).toBe(false);
    expect(canTransitionJob('accepted', 'closed')).toBe(false);
  });

  it('treats closed as terminal', () => {
    const statuses = Object.keys(JOB_TRANSITIONS) as JobStatus[];
    for (const to of statuses) {
      expect(canTransitionJob('closed', to)).toBe(false);
    }
  });
});

describe('active job statuses (one-active-job-per-driver invariant)', () => {
  it('counts accepted/collected/in_transit as active, delivered/closed as not', () => {
    expect(ACTIVE_JOB_STATUSES).toEqual(['accepted', 'collected', 'in_transit']);
    expect(isActiveJobStatus('accepted')).toBe(true);
    expect(isActiveJobStatus('in_transit')).toBe(true);
    expect(isActiveJobStatus('delivered')).toBe(false);
    expect(isActiveJobStatus('closed')).toBe(false);
  });
});

describe('money invariants', () => {
  it('accepts positive bounded integer pence', () => {
    expect(isValidLoadPriceGbpPence(1)).toBe(true);
    expect(isValidLoadPriceGbpPence(30_000)).toBe(true);
    expect(isValidLoadPriceGbpPence(MAX_LOAD_PRICE_GBP_PENCE)).toBe(true);
  });

  it('refuses zero, negatives, floats, non-finite, and over-bound values', () => {
    expect(isValidLoadPriceGbpPence(0)).toBe(false);
    expect(isValidLoadPriceGbpPence(-100)).toBe(false);
    expect(isValidLoadPriceGbpPence(99.5)).toBe(false);
    expect(isValidLoadPriceGbpPence(Number.NaN)).toBe(false);
    expect(isValidLoadPriceGbpPence(Number.POSITIVE_INFINITY)).toBe(false);
    expect(isValidLoadPriceGbpPence(MAX_LOAD_PRICE_GBP_PENCE + 1)).toBe(false);
  });

  it('formats pence as GBP', () => {
    expect(formatGbp(68_000)).toBe('£680.00');
    expect(formatGbp(1_234_567)).toBe('£12,345.67');
  });
});
