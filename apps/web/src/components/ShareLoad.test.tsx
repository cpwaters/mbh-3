import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ShareLoad } from './ShareLoad';

const summary = {
  origin: { town: 'Preston', postcode: 'PR1 2AB' },
  destination: { town: 'Blackpool', postcode: 'FY1 1AA' },
  pickupBy: '2026-08-06',
  priceGbpPence: 55000,
  vehicleSizes: ['artic'],
  vehicleTypes: [],
};

afterEach(() => {
  vi.unstubAllGlobals();
});

function stubDispatch(response: unknown) {
  const fetchMock = vi.fn().mockResolvedValue({ json: async () => response });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

describe('ShareLoad', () => {
  it('makes the load’s short link and offers it to copy and to post on each network', async () => {
    const fetchMock = stubDispatch({ ok: true, result: { code: 'AbC12345' } });
    const user = userEvent.setup();
    render(<ShareLoad tenantId="carrier-1" loadId="load-1" summary={summary} getIdToken={async () => 't'} />);

    await user.click(screen.getByRole('button', { name: 'Share' }));

    const body = JSON.parse(fetchMock.mock.calls[0]?.[1]?.body as string) as { type: string; payload: unknown };
    expect(body).toMatchObject({ type: 'shareLoad', payload: { tenantId: 'carrier-1', loadId: 'load-1' } });
    const url = `${window.location.origin}/l/AbC12345`;
    expect(await screen.findByTestId('share-url')).toHaveTextContent(url);
    expect(screen.getByRole('link', { name: 'Facebook' })).toHaveAttribute(
      'href',
      `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`
    );
    expect(screen.getByRole('link', { name: 'X' })).toHaveAttribute(
      'href',
      expect.stringContaining(encodeURIComponent('Backhaul: Preston PR1 2AB → Blackpool FY1 1AA'))
    );
    for (const network of ['Reddit', 'WhatsApp', 'LinkedIn', 'Email']) {
      expect(screen.getByRole('link', { name: network })).toBeInTheDocument();
    }
    // No share sheet in this browser, so Instagram is explained instead.
    expect(screen.getByText(/Instagram takes no links from websites/)).toBeInTheDocument();
  });

  it('says why when the link cannot be made', async () => {
    stubDispatch({ ok: false, error: { code: 'conflict', message: 'That load is no longer on offer, so there is nothing to share.' } });
    const user = userEvent.setup();
    render(<ShareLoad tenantId="carrier-1" loadId="load-1" summary={summary} getIdToken={async () => 't'} />);
    await user.click(screen.getByRole('button', { name: 'Share' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('no longer on offer');
  });
});
