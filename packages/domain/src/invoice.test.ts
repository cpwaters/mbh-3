import { describe, expect, it } from 'vitest';
import { buildInvoiceNumber, invoiceDueDate, DEFAULT_INVOICE_NET_DAYS } from './invoice.js';

describe('buildInvoiceNumber', () => {
  it('is deterministic for the same job', () => {
    expect(buildInvoiceNumber('job-abc123')).toBe(buildInvoiceNumber('job-abc123'));
  });

  it('differs across jobs', () => {
    expect(buildInvoiceNumber('job-a')).not.toBe(buildInvoiceNumber('job-b'));
  });

  it('is uppercased and prefixed', () => {
    expect(buildInvoiceNumber('job-abc123')).toBe('INV-JOB-ABC123');
  });
});

describe('invoiceDueDate', () => {
  it('defaults to net 30 days', () => {
    expect(DEFAULT_INVOICE_NET_DAYS).toBe(30);
    expect(invoiceDueDate('2026-01-01T00:00:00.000Z')).toBe('2026-01-31T00:00:00.000Z');
  });

  it('respects a custom term', () => {
    expect(invoiceDueDate('2026-01-01T00:00:00.000Z', 7)).toBe('2026-01-08T00:00:00.000Z');
  });
});
