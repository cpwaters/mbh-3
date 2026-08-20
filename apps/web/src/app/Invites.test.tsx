import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import type { Invite } from '@mbh/domain';
import Invites from './Invites';
import { AppProvider } from './context';
import { makeMockApp } from './stories/mock';

const invitesForFounder = vi.fn();
vi.mock('../lib/reader', () => ({
  getReader: () => ({ invitesForFounder: (...args: unknown[]) => invitesForFounder(...args) }),
}));

const A_WEEK_OFF = new Date(Date.now() + 6 * 24 * 60 * 60 * 1000).toISOString();

function invite(overrides: Partial<Invite> = {}): Invite {
  return {
    inviteId: 'inv-abc',
    status: 'pending',
    note: 'Waters Haulage',
    createdAt: '2026-08-19T09:00:00.000Z',
    createdBy: 'founder-1',
    expiresAt: A_WEEK_OFF,
    ...overrides,
  };
}

function renderInvites() {
  return render(
    <AppProvider value={makeMockApp({ isShipper: true, isCarrier: false })}>
      <MemoryRouter>
        <Invites />
      </MemoryRouter>
    </AppProvider>
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
  invitesForFounder.mockReset();
});

describe('Invites — the founder mints links', () => {
  it('shows an unused invitation with its link, ready to send', async () => {
    invitesForFounder.mockResolvedValue([invite()]);
    renderInvites();

    await waitFor(() => expect(screen.getByText('Waters Haulage')).toBeInTheDocument());
    expect(screen.getByText('Unused')).toBeInTheDocument();
    expect(screen.getByText(/\/app\/invite\/inv-abc$/)).toBeInTheDocument();
  });

  it('shows a spent one as used, without offering the link again', async () => {
    invitesForFounder.mockResolvedValue([invite({ status: 'redeemed' })]);
    renderInvites();

    await waitFor(() => expect(screen.getByText('Used')).toBeInTheDocument());
    expect(screen.getByText(/already been used/i)).toBeInTheDocument();
    // A spent link is not a link any more — nothing to copy or withdraw.
    expect(screen.queryByRole('button', { name: /copy link/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /withdraw/i })).not.toBeInTheDocument();
  });

  it('marks one that ran out of time as expired', async () => {
    invitesForFounder.mockResolvedValue([invite({ expiresAt: '2020-01-01T00:00:00.000Z' })]);
    renderInvites();

    await waitFor(() => expect(screen.getByText('Expired')).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: /copy link/i })).not.toBeInTheDocument();
  });

  it('mints a new one and puts the link straight on the clipboard', async () => {
    invitesForFounder.mockResolvedValue([]);
    const writeText = vi.fn().mockResolvedValue(undefined);
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ json: async () => ({ ok: true, result: { inviteId: 'inv-new', expiresAt: A_WEEK_OFF } }) });
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    // AFTER setup(): user-event installs its own clipboard stub, so defining
    // ours first would just be overwritten. jsdom's navigator is not
    // spreadable either, hence defining the single property.
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    renderInvites();

    await waitFor(() => expect(screen.getByText('No invitations yet')).toBeInTheDocument());
    await user.type(screen.getByLabelText(/who is this for/i), 'Tesco');
    await user.click(screen.getByRole('button', { name: /new invitation/i }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const body = JSON.parse(fetchMock.mock.calls[0]?.[1]?.body as string) as {
      type: string;
      payload: Record<string, string>;
    };
    expect(body.type).toBe('createInvite');
    expect(body.payload).toMatchObject({ note: 'Tesco' });
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(expect.stringContaining('/app/invite/inv-new')));
  });

  it('withdraws an unused invitation', async () => {
    invitesForFounder.mockResolvedValue([invite()]);
    const fetchMock = vi.fn().mockResolvedValue({ json: async () => ({ ok: true, result: { inviteId: 'inv-abc' } }) });
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    renderInvites();

    await waitFor(() => expect(screen.getByRole('button', { name: /withdraw/i })).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: /withdraw/i }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const body = JSON.parse(fetchMock.mock.calls[0]?.[1]?.body as string) as { type: string };
    expect(body.type).toBe('revokeInvite');
  });

  it("surfaces the server's refusal rather than pretending it worked", async () => {
    invitesForFounder.mockResolvedValue([]);
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        json: async () => ({ ok: false, error: { code: 'forbidden', message: 'Your role does not permit this action.' } }),
      })
    );
    const user = userEvent.setup();
    renderInvites();

    await waitFor(() => expect(screen.getByRole('button', { name: /new invitation/i })).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: /new invitation/i }));

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/does not permit/i));
  });
});
