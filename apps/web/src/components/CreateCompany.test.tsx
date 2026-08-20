import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Invite } from '@mbh/domain';
import { CreateCompany } from './CreateCompany';
import { setInviteToken, peekInviteToken } from '../lib/inviteToken';

const inviteById = vi.fn();
vi.mock('../lib/reader', () => ({
  getReader: () => ({ inviteById: (...args: unknown[]) => inviteById(...args) }),
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

const onCreated = vi.fn();
const renderIt = () =>
  render(<CreateCompany getIdToken={async () => 'token'} onCreated={onCreated} />);

beforeEach(() => {
  sessionStorage.clear();
  inviteById.mockReset();
  onCreated.mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('CreateCompany — joining is by invitation', () => {
  it('confirms a good invitation before the person fills anything in', async () => {
    setInviteToken('inv-abc');
    inviteById.mockResolvedValue(invite());
    renderIt();

    await waitFor(() => expect(screen.getByText(/invitation is valid/i)).toBeInTheDocument());
    expect(inviteById).toHaveBeenCalledWith('inv-abc');
  });

  it('says so plainly when the link has already been used', async () => {
    setInviteToken('inv-abc');
    inviteById.mockResolvedValue(invite({ status: 'redeemed' }));
    renderIt();

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/already been used/i));
  });

  it('says so when the link has expired', async () => {
    setInviteToken('inv-abc');
    inviteById.mockResolvedValue(invite({ expiresAt: '2020-01-01T00:00:00.000Z' }));
    renderIt();

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/expired/i));
  });

  it('says so when there is no such invitation', async () => {
    setInviteToken('inv-nope');
    inviteById.mockResolvedValue(null);
    renderIt();

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/not valid/i));
  });

  it('sends the invitation id with the company, and spends it only on success', async () => {
    setInviteToken('inv-abc');
    inviteById.mockResolvedValue(invite());
    const fetchMock = vi.fn().mockResolvedValue({ json: async () => ({ ok: true, result: { tenantId: 'tenant-9' } }) });
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    renderIt();

    await waitFor(() => expect(screen.getByText(/invitation is valid/i)).toBeInTheDocument());
    await user.type(screen.getByLabelText(/company name/i), 'Waters Haulage');
    await user.click(screen.getByLabelText(/carrier/i));
    await user.click(screen.getByRole('button', { name: /create company/i }));

    await waitFor(() => expect(onCreated).toHaveBeenCalledWith('tenant-9'));
    const body = JSON.parse(fetchMock.mock.calls[0]?.[1]?.body as string) as { payload: Record<string, unknown> };
    expect(body.payload).toMatchObject({ inviteId: 'inv-abc', name: 'Waters Haulage' });
    expect(peekInviteToken()).toBeNull();
  });

  it('keeps the invitation when the attempt fails, so it can be tried again', async () => {
    setInviteToken('inv-abc');
    inviteById.mockResolvedValue(invite());
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        json: async () => ({ ok: false, error: { code: 'invalid-payload', message: 'Enter a company name.' } }),
      })
    );
    const user = userEvent.setup();
    renderIt();

    await waitFor(() => expect(screen.getByText(/invitation is valid/i)).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: /create company/i }));

    await waitFor(() => expect(screen.getByText('Enter a company name.')).toBeInTheDocument());
    // A stumble must not burn the one link they were given.
    expect(peekInviteToken()).toBe('inv-abc');
    expect(onCreated).not.toHaveBeenCalled();
  });

  it('does not go looking for an invitation when there is none to check', async () => {
    renderIt();
    await waitFor(() => expect(screen.getByRole('button', { name: /create company/i })).toBeInTheDocument());
    expect(inviteById).not.toHaveBeenCalled();
    expect(screen.queryByText(/invitation is valid/i)).not.toBeInTheDocument();
  });
});
