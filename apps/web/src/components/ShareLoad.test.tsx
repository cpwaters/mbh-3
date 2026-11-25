import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ShareLoad, forgetMadeLinks } from './ShareLoad';

const summary = {
  origin: { town: 'Preston', postcode: 'PR1 2AB' },
  destination: { town: 'Blackpool', postcode: 'FY1 1AA' },
  pickupBy: '2026-08-06',
  priceGbpPence: 55000,
  vehicleSizes: ['artic'],
  vehicleTypes: [],
};

const originalShare = Object.getOwnPropertyDescriptor(navigator, 'share');

afterEach(() => {
  vi.unstubAllGlobals();
  forgetMadeLinks();
  if (originalShare) Object.defineProperty(navigator, 'share', originalShare);
  else delete (navigator as { share?: unknown }).share;
});

function stubDispatch(response: unknown) {
  const fetchMock = vi.fn().mockResolvedValue({ json: async () => response });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function withShareSheet(impl: (data: ShareData) => Promise<void>) {
  const share = vi.fn(impl);
  Object.defineProperty(navigator, 'share', { value: share, configurable: true, writable: true });
  return share;
}

const renderShare = () =>
  render(<ShareLoad tenantId="carrier-1" loadId="load-1" summary={summary} getIdToken={async () => 't'} />);

describe('ShareLoad', () => {
  it('makes the load’s short link and opens the phone’s share sheet with it', async () => {
    const fetchMock = stubDispatch({ ok: true, result: { code: 'AbC12345' } });
    const share = withShareSheet(async () => {});
    const user = userEvent.setup();
    renderShare();

    await user.click(screen.getByRole('button', { name: 'Share' }));

    const body = JSON.parse(fetchMock.mock.calls[0]?.[1]?.body as string) as { type: string; payload: unknown };
    expect(body).toMatchObject({ type: 'shareLoad', payload: { tenantId: 'carrier-1', loadId: 'load-1' } });
    await waitFor(() => expect(share).toHaveBeenCalledTimes(1));
    expect(share.mock.calls[0]?.[0]).toMatchObject({
      url: `${window.location.origin}/l/AbC12345`,
      text: expect.stringContaining('Backhaul: Preston PR1 2AB → Blackpool FY1 1AA'),
    });
    // No panel of network buttons any more.
    expect(screen.queryByRole('link', { name: 'Facebook' })).not.toBeInTheDocument();

    // A second share reuses the link without asking the server again.
    await user.click(screen.getByRole('button', { name: 'Share' }));
    await waitFor(() => expect(share).toHaveBeenCalledTimes(2));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('offers one more tap when the phone will not open its sheet after the wait', async () => {
    stubDispatch({ ok: true, result: { code: 'AbC12345' } });
    const share = withShareSheet(async () => {
      if (share.mock.calls.length === 1) throw Object.assign(new Error('no activation'), { name: 'NotAllowedError' });
    });
    const user = userEvent.setup();
    renderShare();

    await user.click(screen.getByRole('button', { name: 'Share' }));
    const again = await screen.findByRole('button', { name: 'Share link' });
    await user.click(again);
    await waitFor(() => expect(share).toHaveBeenCalledTimes(2));
    expect(await screen.findByRole('button', { name: 'Share' })).toBeInTheDocument();
  });

  it('copies the link where there is no share sheet', async () => {
    stubDispatch({ ok: true, result: { code: 'AbC12345' } });
    delete (navigator as { share?: unknown }).share;
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    renderShare();

    await user.click(screen.getByRole('button', { name: 'Share' }));
    expect(await screen.findByText('Link copied:')).toBeInTheDocument();
    expect(writeText).toHaveBeenCalledWith(`${window.location.origin}/l/AbC12345`);
    expect(screen.getByTestId('share-url')).toHaveTextContent('/l/AbC12345');
  });

  it('says why when the link cannot be made', async () => {
    stubDispatch({ ok: false, error: { code: 'conflict', message: 'That load is no longer on offer, so there is nothing to share.' } });
    const user = userEvent.setup();
    renderShare();
    await user.click(screen.getByRole('button', { name: 'Share' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('no longer on offer');
  });
});
